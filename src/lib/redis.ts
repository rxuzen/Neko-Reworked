import Redis from 'ioredis';
import { CACHE_LIMITS } from '../config/constants.ts';
import { env } from '../config/env.ts';
import { pinoLogger } from './logger.ts';

export const redis = new Redis(env.REDIS_URL, {
	lazyConnect: true,
	maxRetriesPerRequest: 2,
	enableReadyCheck: false,
	retryStrategy(times) {
		if (env.NODE_ENV === 'test' || times > 3) {
			return null;
		}
		return Math.min(times * 200, 2_000);
	},
});

redis.on('error', (err) => {
	if (env.NODE_ENV !== 'test') {
		pinoLogger.debug({ err }, 'Redis connection error (using local memory fallback)');
	}
});

// Local memory fallback for test environments or when Redis is offline
const memoryLocks = new Map<string, { token: string; expiresAtMs: number }>();
const memoryCooldowns = new Map<string, number>();

function isRedisReady(): boolean {
	return redis.status === 'ready';
}

const ATOMIC_COOLDOWN_LUA = `
local pttl = redis.call("PTTL", KEYS[1])
if pttl > 0 then
  return pttl
end
redis.call("SET", KEYS[1], "1", "PX", ARGV[1])
return 0
`;

const RELEASE_LOCK_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

export interface CooldownCheckResult {
	onCooldown: boolean;
	remainingMs: number;
	expiresAtUnix: number;
}

export async function checkAndSetCooldown(
	key: string,
	ttlMs: number,
	nowMs: number = Date.now(),
): Promise<CooldownCheckResult> {
	const fullKey = `cd:${key}`;

	if (isRedisReady()) {
		try {
			const pttl = Number(await redis.eval(ATOMIC_COOLDOWN_LUA, 1, fullKey, String(ttlMs)));
			if (pttl > 0) {
				return {
					onCooldown: true,
					remainingMs: pttl,
					expiresAtUnix: Math.ceil((nowMs + pttl) / 1_000),
				};
			}
			return {
				onCooldown: false,
				remainingMs: 0,
				expiresAtUnix: Math.ceil((nowMs + ttlMs) / 1_000),
			};
		} catch {
			// Fall through to in-memory fallback
		}
	}

	const existingExpiry = memoryCooldowns.get(fullKey);
	if (existingExpiry && existingExpiry > nowMs) {
		const remainingMs = existingExpiry - nowMs;
		return {
			onCooldown: true,
			remainingMs,
			expiresAtUnix: Math.ceil(existingExpiry / 1_000),
		};
	}

	const nextExpiry = nowMs + ttlMs;
	memoryCooldowns.set(fullKey, nextExpiry);
	return {
		onCooldown: false,
		remainingMs: 0,
		expiresAtUnix: Math.ceil(nextExpiry / 1_000),
	};
}

export interface ActionLockHandle {
	acquired: boolean;
	release: () => Promise<void>;
}

export async function acquireActionLock(
	userId: string,
	ttlMs: number = CACHE_LIMITS.ACTION_LOCK_TTL_MS,
): Promise<ActionLockHandle> {
	const lockKey = `lock:action:${userId}`;
	const token = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

	if (isRedisReady()) {
		try {
			const res = await redis.set(lockKey, token, 'PX', ttlMs, 'NX');
			if (res !== 'OK') {
				return { acquired: false, release: async () => {} };
			}
			return {
				acquired: true,
				release: async () => {
					try {
						await redis.eval(RELEASE_LOCK_LUA, 1, lockKey, token);
					} catch {
						// Ignore release errors
					}
				},
			};
		} catch {
			// Fall through to in-memory lock
		}
	}

	const nowMs = Date.now();
	const current = memoryLocks.get(lockKey);
	if (current && current.expiresAtMs > nowMs) {
		return { acquired: false, release: async () => {} };
	}

	memoryLocks.set(lockKey, { token, expiresAtMs: nowMs + ttlMs });
	return {
		acquired: true,
		release: async () => {
			const entry = memoryLocks.get(lockKey);
			if (entry && entry.token === token) {
				memoryLocks.delete(lockKey);
			}
		},
	};
}

export async function acquireDualActionLock(
	userA: string,
	userB: string,
	ttlMs = 2_500,
): Promise<ActionLockHandle> {
	if (userA === userB) {
		return acquireActionLock(userA, ttlMs);
	}

	// Sort lexicographically to guarantee deadlock-free lock acquisition order
	const [firstId, secondId] = userA < userB ? [userA, userB] : [userB, userA];

	const firstLock = await acquireActionLock(firstId, ttlMs);
	if (!firstLock.acquired) {
		return { acquired: false, release: async () => {} };
	}

	const secondLock = await acquireActionLock(secondId, ttlMs);
	if (!secondLock.acquired) {
		await firstLock.release();
		return { acquired: false, release: async () => {} };
	}

	return {
		acquired: true,
		release: async () => {
			await Promise.allSettled([secondLock.release(), firstLock.release()]);
		},
	};
}
