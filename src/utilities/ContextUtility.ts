import { Utility } from '@sapphire/plugin-utilities-store';
import { eq, sql } from 'drizzle-orm';
import { PROGRESSION_LIMITS } from '../config/constants.ts';
import { db } from '../db/index.ts';
import {
	type CompanionRow,
	type UserRow,
	type UserSettingsRow,
	companions,
	userSettings,
	users,
} from '../db/schema/index.ts';
import { OMIKUJI_FORTUNES } from '../db/seed.ts';
import { acquireActionLock, acquireDualActionLock } from '../lib/redis.ts';

export interface HydratedUserContext {
	user: UserRow;
	settings: UserSettingsRow;
	companion: CompanionRow;
	effectiveXpMultiplierBonus: number;
	effectiveCoinMultiplierBonus: number;
}

const singleQueryContextPrepared = db
	.select({
		user: users,
		settings: userSettings,
		companion: companions,
	})
	.from(users)
	.leftJoin(userSettings, eq(users.id, userSettings.userId))
	.leftJoin(companions, eq(users.id, companions.userId))
	.where(eq(users.id, sql.placeholder('userId')))
	.limit(1)
	.prepare('neko_hydrate_user_context');

export function createDefaultUserContext(
	userId: string,
	now: Date = new Date(),
): {
	user: UserRow;
	settings: UserSettingsRow;
	companion: CompanionRow;
} {
	return {
		user: {
			id: userId,
			xp: 0,
			level: 1,
			coins: 0,
			vaultCoins: 0,
			vaultCapacity: 5_000,
			gems: 0,
			shards: 0,
			starShards: 0,
			careerId: 'konbini_clerk',
			careerXp: 0,
			careerLevel: 1,
			equippedTitle: '[ NEKO ] Stray Kitten',
			bio: 'A wandering Neko adventurer.',
			xpMultiplierPerm: 0,
			coinMultiplierPerm: 0,
			shrineStreak: 0,
			lastShrineCheckinAt: null,
			omikujiFortune: null,
			omikujiExpiresAt: null,
			matsuriPoints: 0,
			createdAt: now,
			updatedAt: now,
		},
		settings: {
			userId,
			titleLanguage: 'ROMAJI',
			timezone: 'UTC',
			compactMode: false,
			levelUpAlerts: true,
			airingDmAlerts: true,
			expeditionDmAlerts: true,
			loanReminderAlerts: true,
			publicWallet: true,
			allowTradeRequests: true,
			allowBorrowRequests: true,
			updatedAt: now,
		},
		companion: {
			userId,
			partnerName: 'Shiro (Neko Familiar)',
			partnerRarity: 'SR',
			partnerStars: 1,
			partnerImageUrl: null,
			gachaCardId: null,
			bondLevel: 1,
			affectionXp: 0,
			mood: 100,
			lastHeadpatAt: null,
			lastFedAt: null,
			expeditionZoneId: null,
			expeditionStartedAt: null,
			expeditionEndsAt: null,
			updatedAt: now,
		},
	};
}

export function calculateRequiredXpForLevel(level: number): number {
	const clamped = Math.max(1, Math.min(PROGRESSION_LIMITS.MAX_USER_LEVEL, level));
	return Math.floor(PROGRESSION_LIMITS.XP_BASE * clamped ** PROGRESSION_LIMITS.XP_EXPONENT);
}

export function calculateEffectiveMultipliers(
	user: UserRow,
	companion: CompanionRow,
	nowMs: number = Date.now(),
): { xpBonus: number; coinBonus: number } {
	// Companion bond passive bonus: +1% XP & +0.75% Coins per bond level + star bonus
	const companionXpBonus = companion.bondLevel * 0.01 + (companion.partnerStars - 1) * 0.02;
	const companionCoinBonus = companion.bondLevel * 0.0075 + (companion.partnerStars - 1) * 0.015;

	// Shrine Omikuji fortune bonus (if active)
	let fortuneXpBonus = 0;
	let fortuneCoinBonus = 0;
	if (user.omikujiFortune && user.omikujiExpiresAt && user.omikujiExpiresAt.getTime() > nowMs) {
		const fortuneDef = OMIKUJI_FORTUNES.find((f) => f.id === user.omikujiFortune);
		if (fortuneDef) {
			fortuneXpBonus = fortuneDef.xpBonus;
			fortuneCoinBonus = fortuneDef.coinBonus;
		}
	}

	const rawXpBonus = user.xpMultiplierPerm + companionXpBonus + fortuneXpBonus;
	const rawCoinBonus = user.coinMultiplierPerm + companionCoinBonus + fortuneCoinBonus;

	return {
		xpBonus: Math.min(
			PROGRESSION_LIMITS.MAX_XP_MULTIPLIER_BONUS,
			Math.max(-0.5, Number(rawXpBonus.toFixed(4))),
		),
		coinBonus: Math.min(
			PROGRESSION_LIMITS.MAX_COIN_MULTIPLIER_BONUS,
			Math.max(-0.5, Number(rawCoinBonus.toFixed(4))),
		),
	};
}

export class ContextUtility extends Utility {
	public constructor(context: Utility.LoaderContext, options: Utility.Options) {
		super(context, {
			...options,
			name: 'context',
		});
		this.container.context = this;
	}

	public readonly calculateRequiredXpForLevel = calculateRequiredXpForLevel;
	public readonly calculateEffectiveMultipliers = calculateEffectiveMultipliers;
	public readonly createDefaultUserContext = createDefaultUserContext;
	public readonly acquireActionLock = acquireActionLock;
	public readonly acquireDualActionLock = acquireDualActionLock;

	public async getUserContext(userId: string): Promise<HydratedUserContext> {
		const defaults = createDefaultUserContext(userId);

		try {
			const rows = await singleQueryContextPrepared.execute({ userId });
			const first = rows[0];

			if (first?.user && first.settings && first.companion) {
				const { xpBonus, coinBonus } = calculateEffectiveMultipliers(first.user, first.companion);
				return {
					user: first.user,
					settings: first.settings,
					companion: first.companion,
					effectiveXpMultiplierBonus: xpBonus,
					effectiveCoinMultiplierBonus: coinBonus,
				};
			}

			// First-time user: initialize rows inside an atomic transaction
			await db.transaction(async (tx) => {
				await tx.insert(users).values({ id: userId }).onConflictDoNothing();
				await tx.insert(userSettings).values({ userId }).onConflictDoNothing();
				await tx.insert(companions).values({ userId }).onConflictDoNothing();
			});

			const hydrated = await singleQueryContextPrepared.execute({ userId });
			const created = hydrated[0];
			const user = created?.user ?? defaults.user;
			const settings = created?.settings ?? defaults.settings;
			const companion = created?.companion ?? defaults.companion;
			const { xpBonus, coinBonus } = calculateEffectiveMultipliers(user, companion);

			return {
				user,
				settings,
				companion,
				effectiveXpMultiplierBonus: xpBonus,
				effectiveCoinMultiplierBonus: coinBonus,
			};
		} catch {
			// Fallback to defaults if PostgreSQL is offline during development/testing
			const { xpBonus, coinBonus } = calculateEffectiveMultipliers(
				defaults.user,
				defaults.companion,
			);
			return {
				...defaults,
				effectiveXpMultiplierBonus: xpBonus,
				effectiveCoinMultiplierBonus: coinBonus,
			};
		}
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		context: ContextUtility;
	}
}

declare module '@sapphire/plugin-utilities-store' {
	export interface Utilities {
		context: ContextUtility;
	}
}
