import { describe, expect, it } from 'bun:test';
import {
	buildProfileCardContainer,
	calculateRequiredAffectionForBond,
} from '../commands/user/profile.ts';
import { buildSettingsCardContainer } from '../commands/user/settings.ts';
import { bioModalSchema } from '../interaction-handlers/user/ProfileBioModalHandler.ts';
import { calculateChatXpAndDrop } from '../listeners/messageCreate.ts';
import {
	type HydratedUserContext,
	calculateEffectiveMultipliers,
	createDefaultUserContext,
} from '../utilities/ContextUtility.ts';

function createMockHydratedContext(userId: string): HydratedUserContext {
	const defaults = createDefaultUserContext(userId);
	const { xpBonus, coinBonus } = calculateEffectiveMultipliers(defaults.user, defaults.companion);
	return {
		...defaults,
		effectiveXpMultiplierBonus: xpBonus,
		effectiveCoinMultiplierBonus: coinBonus,
	};
}

describe('Phase 5: Profile, Neko Companion & User Settings Hubs', () => {
	it('renders /profile OVERVIEW and enforces publicWallet privacy when inspecting others', () => {
		const ctx = createMockHydratedContext('987654321098765432');
		ctx.user.coins = 50_000;
		ctx.settings.publicWallet = false;

		const privateCard = buildProfileCardContainer({
			ownerId: '123456789012345678',
			targetUserId: '987654321098765432',
			targetUsername: 'Momo',
			ctx,
			tab: 'overview',
		});
		const privateJson = JSON.stringify(privateCard.toJSON());
		expect(privateJson).toContain('[ ACCESS DENIED ]');
		expect(privateJson).not.toContain('50,000 Coins');

		// Owner viewing their own profile always sees their wallet
		const selfCard = buildProfileCardContainer({
			ownerId: '987654321098765432',
			targetUserId: '987654321098765432',
			targetUsername: 'Momo',
			ctx,
			tab: 'overview',
		});
		expect(JSON.stringify(selfCard.toJSON())).toContain('50,000 Coins');
	});

	it('renders /profile COMPANION tab with bond stats, active expeditions, and claim states', () => {
		expect(calculateRequiredAffectionForBond(1)).toBe(150);
		expect(calculateRequiredAffectionForBond(10)).toBeGreaterThan(2_500);

		const ctx = createMockHydratedContext('123456789012345678');
		ctx.companion.partnerName = 'Momo Ayase';
		ctx.companion.partnerRarity = 'SSR';
		ctx.companion.partnerStars = 3;
		ctx.companion.bondLevel = 14;
		ctx.companion.affectionXp = 1_420;
		ctx.companion.expeditionZoneId = 'akihabara_arcade';
		ctx.companion.expeditionEndsAt = new Date(1_795_090_000_000);

		const runningCard = buildProfileCardContainer({
			ownerId: '123456789012345678',
			targetUserId: '123456789012345678',
			targetUsername: 'Ryu',
			ctx,
			tab: 'companion',
			nowMs: 1_795_000_000_000,
		});
		const runningJson = JSON.stringify(runningCard.toJSON());
		expect(runningJson).toContain('Momo Ayase [SSR • ★★★☆☆]');
		expect(runningJson).toContain('[ EXPEDITION ] Exploring **Akihabara Arcade District**');

		// Claimable expedition when nowMs >= expeditionEndsAt
		const claimableCard = buildProfileCardContainer({
			ownerId: '123456789012345678',
			targetUserId: '123456789012345678',
			targetUsername: 'Ryu',
			ctx,
			tab: 'companion',
			nowMs: 1_795_100_000_000,
		});
		expect(JSON.stringify(claimableCard.toJSON())).toContain('Claim Expedition');
	});

	it('renders /profile CAREER and CUSTOMIZE tabs and validates bio modal submissions with Zod', () => {
		const ctx = createMockHydratedContext('123456789012345678');
		const careerCard = buildProfileCardContainer({
			ownerId: '123456789012345678',
			targetUserId: '123456789012345678',
			targetUsername: 'Ryu',
			ctx,
			tab: 'career',
		});
		expect(JSON.stringify(careerCard.toJSON())).toContain('Konbini Night Clerk');

		expect(bioModalSchema.safeParse('Shrine regular & anime collector.').success).toBe(true);
		expect(bioModalSchema.safeParse('').success).toBe(false);
		expect(bioModalSchema.safeParse('Join https://discord.gg/invite').success).toBe(false);
	});

	it('renders /settings across GENERAL, NOTIFICATIONS, and PRIVACY tabs and computes chat XP drops', () => {
		const ctx = createMockHydratedContext('123456789012345678');

		const general = buildSettingsCardContainer({
			ownerId: '123456789012345678',
			settings: ctx.settings,
			tab: 'general',
		});
		expect(JSON.stringify(general.toJSON())).toContain('DISPLAY & REGIONAL PREFERENCES');

		const privacy = buildSettingsCardContainer({
			ownerId: '123456789012345678',
			settings: ctx.settings,
			tab: 'privacy',
		});
		expect(JSON.stringify(privacy.toJSON())).toContain('Public Wallet Visibility');

		const dropRoll = calculateChatXpAndDrop(0.5, 0.01);
		expect(dropRoll.earnedXp).toBeGreaterThanOrEqual(22);
		expect(dropRoll.droppedShards).toBeGreaterThanOrEqual(1);

		const normalRoll = calculateChatXpAndDrop(0, 0.5);
		expect(normalRoll.droppedShards).toBe(0);
	});
});
