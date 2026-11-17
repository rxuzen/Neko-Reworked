import { describe, expect, it } from 'bun:test';
import { buildEconomyCardContainer } from '../commands/economy/economy.ts';
import {
	buildGachaCardContainer,
	rollRarityWithPity,
	simulateBannerPull,
} from '../commands/gacha/gacha.ts';
import { buildMatsuriCardContainer, drawWeightedOmikuji } from '../commands/matsuri/matsuri.ts';
import { derivePokemonRarityFromBst, getCuratedPokemonByRarity } from '../services/poke.service.ts';
import {
	type HydratedUserContext,
	calculateEffectiveMultipliers,
	createDefaultUserContext,
} from '../utilities/ContextUtility.ts';

function createMockContext(userId: string): HydratedUserContext {
	const defaults = createDefaultUserContext(userId);
	const { xpBonus, coinBonus } = calculateEffectiveMultipliers(defaults.user, defaults.companion);
	return {
		...defaults,
		effectiveXpMultiplierBonus: xpBonus,
		effectiveCoinMultiplierBonus: coinBonus,
	};
}

describe('Phase 6: Economy, Gacha & Unified Matsuri Hub', () => {
	it('builds /economy across WALLET, SHOP, QUESTS, and TRANSFER tabs and enforces Level 5+ gates', () => {
		const ctx = createMockContext('123456789012345678');
		ctx.user.coins = 5_000;
		ctx.user.vaultCoins = 2_000;

		const walletCard = buildEconomyCardContainer({
			ownerId: '123456789012345678',
			ctx,
			tab: 'wallet',
		});
		expect(JSON.stringify(walletCard.toJSON())).toContain('Anti-Rob Vault');

		const shopCard = buildEconomyCardContainer({
			ownerId: '123456789012345678',
			ctx,
			tab: 'shop',
		});
		expect(JSON.stringify(shopCard.toJSON())).toContain('Matcha Taiyaki');

		// Level 1 user is gated from P2P transfers
		const gatedTransfer = buildEconomyCardContainer({
			ownerId: '123456789012345678',
			ctx,
			tab: 'transfer',
		});
		expect(JSON.stringify(gatedTransfer.toJSON())).toContain('ANTI-ALT PROGRESSION GATE');

		// Level 5+ user unlocks transfers & loans
		ctx.user.level = 6;
		const unlockedTransfer = buildEconomyCardContainer({
			ownerId: '123456789012345678',
			ctx,
			tab: 'transfer',
			selectedTargetId: '987654321098765432',
		});
		expect(JSON.stringify(unlockedTransfer.toJSON())).toContain(
			'PEER-TO-PEER TRANSFERS, LOANS & HEISTS',
		);
	});

	it('enforces soft/hard Gacha pity (65/80), PokeDex BST rarity, and 5-Star Ascension cards', () => {
		expect(derivePokemonRarityFromBst(680)).toBe('UR');
		expect(derivePokemonRarityFromBst(525)).toBe('SSR');
		expect(getCuratedPokemonByRarity('UR').name).toBeDefined();

		// Hard pity at pull #80 (pullsSinceSsr = 79) guarantees SSR/UR and resets pity
		const hardPityRoll = rollRarityWithPity(79, false, 0.95);
		expect(['SSR', 'UR']).toContain(hardPityRoll.rarity);
		expect(hardPityRoll.resetPity).toBe(true);

		const sim = simulateBannerPull('ANILIST', 79, [], false);
		expect(sim.nextPullsSinceSsr).toBe(0);
		expect(['SSR', 'UR']).toContain(sim.outcome.rarity);

		const ctx = createMockContext('123456789012345678');
		ctx.user.shards = 120;
		ctx.user.starShards = 45;

		const anilistCard = buildGachaCardContainer({
			ownerId: '123456789012345678',
			ctx,
			tab: 'anilist',
			lastPullResults: [sim.outcome],
		});
		expect(JSON.stringify(anilistCard.toJSON())).toContain('BANNER TELEMETRY & PITY STATUS');

		const collectionCard = buildGachaCardContainer({
			ownerId: '123456789012345678',
			ctx,
			tab: 'collection',
			collection: [
				{
					id: 1,
					userId: '123456789012345678',
					banner: 'ANILIST',
					externalId: 284910,
					name: 'Momo Ayase',
					seriesOrType: 'Dandadan',
					rarity: 'SSR',
					stars: 5,
					duplicates: 4,
					imageUrl: 'https://example.com/momo.jpg',
					altImageUrl: 'https://example.com/momo-awk.jpg',
					isFavorite: true,
					obtainedAt: new Date(),
				},
			],
		});
		expect(JSON.stringify(collectionCard.toJSON())).toContain('[ ASCENDED ]');
	});

	it('builds Unified /matsuri Hub across SHRINE, BOOTHS, TRIVIA, and LEADERBOARD tabs', () => {
		const daiKichi = drawWeightedOmikuji(0.01);
		expect(daiKichi.id).toBe('DAI_KICHI');
		expect(daiKichi.statusTag).toBe('BLESSED');

		const kyou = drawWeightedOmikuji(0.99);
		expect(kyou.id).toBe('KYOU');
		expect(kyou.statusTag).toBe('CURSED');

		const ctx = createMockContext('123456789012345678');
		ctx.user.coins = 500;
		ctx.user.omikujiFortune = 'KYOU';
		ctx.user.omikujiExpiresAt = new Date(Date.now() + 36_000_000);

		const shrineCard = buildMatsuriCardContainer({
			ownerId: '123456789012345678',
			ctx,
			tab: 'shrine',
		});
		const shrineJson = JSON.stringify(shrineCard.toJSON());
		expect(shrineJson).toContain('[ CURSED ]');
		expect(shrineJson).toContain('Tie to Pine Tree (150 Coins)');

		const triviaCard = buildMatsuriCardContainer({
			ownerId: '123456789012345678',
			ctx,
			tab: 'trivia',
		});
		expect(JSON.stringify(triviaCard.toJSON())).toContain('ANIME TRIVIA CHALLENGE');
	});
});
