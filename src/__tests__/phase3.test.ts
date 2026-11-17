import { describe, expect, it } from 'bun:test';
import { buildNekoHubContainer } from '../commands/utility/neko.ts';
import * as schema from '../db/schema/index.ts';
import { CAREER_CATALOG, EXPEDITION_ZONES, OMIKUJI_FORTUNES, SHOP_CATALOG } from '../db/seed.ts';
import {
	L1Cache,
	getCircuitState,
	resetCircuitBreaker,
	singleflight,
	withCircuitBreaker,
} from '../lib/cache.ts';
import { acquireActionLock, acquireDualActionLock, checkAndSetCooldown } from '../lib/redis.ts';
import {
	calculateEffectiveMultipliers,
	calculateRequiredXpForLevel,
	createDefaultUserContext,
} from '../utilities/ContextUtility.ts';

describe('Phase 3: Database, Redis & Rate-Limit Infrastructure', () => {
	it('exports all 10 Drizzle schema table definitions and seed catalogs', () => {
		expect(schema.users).toBeDefined();
		expect(schema.userSettings).toBeDefined();
		expect(schema.inventory).toBeDefined();
		expect(schema.guilds).toBeDefined();
		expect(schema.audits).toBeDefined();
		expect(schema.watchlists).toBeDefined();
		expect(schema.gachaCards).toBeDefined();
		expect(schema.gachaPity).toBeDefined();
		expect(schema.gachaWishlists).toBeDefined();
		expect(schema.companions).toBeDefined();
		expect(schema.loans).toBeDefined();
		expect(schema.quests).toBeDefined();

		expect(SHOP_CATALOG.length).toBeGreaterThanOrEqual(8);
		expect(CAREER_CATALOG.length).toBe(5);
		expect(EXPEDITION_ZONES.length).toBe(3);
		expect(OMIKUJI_FORTUNES.length).toBe(5);
	});

	it('enforces bounded L1 cache, singleflight coalescing, and circuit breaker failover', async () => {
		const cache = new L1Cache<string>(2, 1_000);
		cache.set('a', '1', 1_000, 100);
		cache.set('b', '2', 1_000, 100);
		cache.set('c', '3', 1_000, 100);
		expect(cache.get('a', 200)).toBeUndefined();
		expect(cache.get('b', 200)).toBe('2');
		expect(cache.get('b', 1_500)).toBeUndefined();

		let fetchCount = 0;
		const [r1, r2, r3] = await Promise.all([
			singleflight('test-sf', async () => {
				fetchCount++;
				await new Promise((r) => setTimeout(r, 15));
				return 'coalesced-value';
			}),
			singleflight('test-sf', async () => {
				fetchCount++;
				return 'should-not-run';
			}),
			singleflight('test-sf', async () => {
				fetchCount++;
				return 'should-not-run-either';
			}),
		]);
		expect(fetchCount).toBe(1);
		expect(r1).toBe('coalesced-value');
		expect(r2).toBe('coalesced-value');
		expect(r3).toBe('coalesced-value');

		resetCircuitBreaker('anilist-test');
		for (let i = 0; i < 5; i++) {
			const res = await withCircuitBreaker(
				'anilist-test',
				async () => {
					throw new Error('Upstream timeout');
				},
				async () => 'jikan-fallback',
				1_000,
			);
			expect(res).toBe('jikan-fallback');
		}

		const state = getCircuitState('anilist-test', 2_000);
		expect(state.isOpen).toBe(true);
		expect(state.failures).toBe(5);
	});

	it('acquires and releases single-user and dual-user locks and atomic cooldowns', async () => {
		const lock1 = await acquireActionLock('user_100', 2_000);
		expect(lock1.acquired).toBe(true);

		const lock1Duplicate = await acquireActionLock('user_100', 2_000);
		expect(lock1Duplicate.acquired).toBe(false);

		await lock1.release();
		const lock1Retry = await acquireActionLock('user_100', 2_000);
		expect(lock1Retry.acquired).toBe(true);
		await lock1Retry.release();

		const dual = await acquireDualActionLock('user_b', 'user_a', 2_000);
		expect(dual.acquired).toBe(true);
		const conflictSingle = await acquireActionLock('user_a', 2_000);
		expect(conflictSingle.acquired).toBe(false);
		await dual.release();

		const cdFirst = await checkAndSetCooldown('anime:user_100', 5_000, 10_000);
		expect(cdFirst.onCooldown).toBe(false);
		const cdSecond = await checkAndSetCooldown('anime:user_100', 5_000, 11_000);
		expect(cdSecond.onCooldown).toBe(true);
		expect(cdSecond.remainingMs).toBe(4_000);
	});

	it('calculates XP progression curves and enforces +250% XP / +200% Coin multiplier caps', () => {
		expect(calculateRequiredXpForLevel(1)).toBe(100);
		expect(calculateRequiredXpForLevel(10)).toBeGreaterThan(2_500);

		const defaults = createDefaultUserContext('123456789012345678');
		defaults.user.xpMultiplierPerm = 3.0;
		defaults.user.coinMultiplierPerm = 3.0;
		defaults.companion.bondLevel = 25;
		defaults.companion.partnerStars = 5;

		const capped = calculateEffectiveMultipliers(defaults.user, defaults.companion);
		expect(capped.xpBonus).toBe(2.5);
		expect(capped.coinBonus).toBe(2.0);
	});

	it('renders the /neko CV2 utility hub across GUIDE, ABOUT, and CHANGELOG tabs', () => {
		const guideCard = buildNekoHubContainer({
			ownerId: '123456789012345678',
			tab: 'guide',
			guideCategory: 'matsuri',
			wsPing: 24,
			guildCount: 12,
			commandCount: 13,
			handlerCount: 8,
		});
		expect(JSON.stringify(guideCard.toJSON())).toContain('UNIFIED MATSURI HUB');

		const aboutCard = buildNekoHubContainer({
			ownerId: '123456789012345678',
			tab: 'about',
			wsPing: 24,
			guildCount: 12,
			commandCount: 13,
			handlerCount: 8,
		});
		expect(JSON.stringify(aboutCard.toJSON())).toContain('RUNTIME TELEMETRY');

		const changelogCard = buildNekoHubContainer({
			ownerId: '123456789012345678',
			tab: 'changelog',
			wsPing: 24,
			guildCount: 12,
			commandCount: 13,
			handlerCount: 8,
		});
		expect(JSON.stringify(changelogCard.toJSON())).toContain('INITIAL ARCHITECTURE');
	});
});
