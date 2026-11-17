import { CACHE_LIMITS } from '../config/constants.ts';
import { pinoLogger } from './logger.ts';
import { redis } from './redis.ts';

interface L1Entry<T> {
	value: T;
	expiresAtMs: number;
}

export class L1Cache<T = unknown> {
	private readonly store = new Map<string, L1Entry<T>>();
	private readonly maxEntries: number;
	private readonly defaultTtlMs: number;

	public constructor(
		maxEntries: number = CACHE_LIMITS.L1_MAX_ENTRIES,
		defaultTtlMs: number = CACHE_LIMITS.L1_TTL_MS,
	) {
		this.maxEntries = maxEntries;
		this.defaultTtlMs = defaultTtlMs;
	}

	public get(key: string, nowMs: number = Date.now()): T | undefined {
		const entry = this.store.get(key);
		if (!entry) return undefined;

		if (nowMs >= entry.expiresAtMs) {
			this.store.delete(key);
			return undefined;
		}

		return entry.value;
	}

	public set(
		key: string,
		value: T,
		ttlMs: number = this.defaultTtlMs,
		nowMs: number = Date.now(),
	): void {
		if (this.store.size >= this.maxEntries && !this.store.has(key)) {
			const oldestKey = this.store.keys().next().value;
			if (oldestKey !== undefined) {
				this.store.delete(oldestKey);
			}
		}

		this.store.set(key, {
			value,
			expiresAtMs: nowMs + ttlMs,
		});
	}

	public delete(key: string): void {
		this.store.delete(key);
	}

	public clear(): void {
		this.store.clear();
	}

	public get size(): number {
		return this.store.size;
	}
}

export const l1Cache = new L1Cache();

const inflightRequests = new Map<string, Promise<unknown>>();

export async function singleflight<T>(key: string, factory: () => Promise<T>): Promise<T> {
	const existing = inflightRequests.get(key);
	if (existing) {
		return existing as Promise<T>;
	}

	const promise = (async () => {
		try {
			return await factory();
		} finally {
			inflightRequests.delete(key);
		}
	})();

	inflightRequests.set(key, promise);
	return promise;
}

export interface TwoTierCacheOptions {
	l1TtlMs?: number;
	l2TtlSeconds?: number;
	skipL1?: boolean;
}

export async function getOrSetCache<T>(
	key: string,
	fetcher: () => Promise<T>,
	options: TwoTierCacheOptions = {},
): Promise<T> {
	const l1TtlMs = options.l1TtlMs ?? CACHE_LIMITS.L1_TTL_MS;
	const l2TtlSeconds = options.l2TtlSeconds ?? CACHE_LIMITS.L2_DEFAULT_TTL_SECONDS;

	if (!options.skipL1) {
		const l1Hit = l1Cache.get(key) as T | undefined;
		if (l1Hit !== undefined) {
			return l1Hit;
		}
	}

	if (redis.status === 'ready') {
		try {
			const rawL2 = await redis.get(`cache:${key}`);
			if (rawL2 !== null) {
				const parsed = JSON.parse(rawL2) as T;
				if (!options.skipL1) {
					l1Cache.set(key, parsed, l1TtlMs);
				}
				return parsed;
			}
		} catch {
			// Ignore Redis deserialization or read errors
		}
	}

	return singleflight(key, async () => {
		const fresh = await fetcher();
		if (!options.skipL1) {
			l1Cache.set(key, fresh, l1TtlMs);
		}
		if (redis.status === 'ready') {
			try {
				await redis.set(`cache:${key}`, JSON.stringify(fresh), 'EX', l2TtlSeconds);
			} catch {
				// Ignore Redis write failure
			}
		}
		return fresh;
	});
}

interface CircuitState {
	failures: number;
	windowStartedAtMs: number;
	openUntilMs: number;
}

const localCircuits = new Map<string, CircuitState>();

export function getCircuitState(
	service: string,
	nowMs: number = Date.now(),
): {
	isOpen: boolean;
	failures: number;
	openUntilMs: number;
} {
	const state = localCircuits.get(service);
	if (!state) {
		return { isOpen: false, failures: 0, openUntilMs: 0 };
	}
	return {
		isOpen: state.openUntilMs > nowMs,
		failures: state.failures,
		openUntilMs: state.openUntilMs,
	};
}

export function resetCircuitBreaker(service: string): void {
	localCircuits.delete(service);
}

export async function withCircuitBreaker<T>(
	service: string,
	primaryFn: () => Promise<T>,
	fallbackFn: (reason: unknown) => Promise<T>,
	nowMs: number = Date.now(),
): Promise<T> {
	const openKey = `cb:${service}:open`;

	// Check local + Redis circuit state
	const local = localCircuits.get(service);
	if (local && local.openUntilMs > nowMs) {
		return fallbackFn(new Error(`Circuit breaker open for ${service}`));
	}

	if (redis.status === 'ready') {
		try {
			const isOpenInRedis = await redis.get(openKey);
			if (isOpenInRedis === '1') {
				return fallbackFn(new Error(`Redis circuit breaker open for ${service}`));
			}
		} catch {
			// Ignore Redis check error
		}
	}

	try {
		const result = await primaryFn();
		localCircuits.delete(service);
		if (redis.status === 'ready') {
			void redis.del(`cb:${service}:failures`).catch(() => {});
		}
		return result;
	} catch (error) {
		const windowMs = CACHE_LIMITS.CIRCUIT_BREAKER_WINDOW_SECONDS * 1_000;
		const openDurationMs = CACHE_LIMITS.CIRCUIT_BREAKER_OPEN_SECONDS * 1_000;

		const current = localCircuits.get(service);
		const isWithinWindow = current && nowMs - current.windowStartedAtMs <= windowMs;
		const failures = isWithinWindow ? current.failures + 1 : 1;
		const windowStartedAtMs = isWithinWindow ? current.windowStartedAtMs : nowMs;
		const shouldTrip = failures >= CACHE_LIMITS.CIRCUIT_BREAKER_FAILURE_THRESHOLD;

		localCircuits.set(service, {
			failures,
			windowStartedAtMs,
			openUntilMs: shouldTrip ? nowMs + openDurationMs : 0,
		});

		if (shouldTrip) {
			pinoLogger.warn(
				{ service, failures },
				`Circuit breaker tripped for ${service}; routing to fallback for ${CACHE_LIMITS.CIRCUIT_BREAKER_OPEN_SECONDS}s`,
			);
			if (redis.status === 'ready') {
				void redis
					.set(openKey, '1', 'EX', CACHE_LIMITS.CIRCUIT_BREAKER_OPEN_SECONDS)
					.catch(() => {});
			}
		}

		return fallbackFn(error);
	}
}
