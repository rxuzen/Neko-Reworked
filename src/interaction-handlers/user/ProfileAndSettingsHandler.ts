import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
	ActionRowBuilder,
	type ButtonInteraction,
	MessageFlags,
	ModalBuilder,
	type StringSelectMenuInteraction,
	TextInputBuilder,
	TextInputStyle,
	type UserSelectMenuInteraction,
} from 'discord.js';
import { eq, sql } from 'drizzle-orm';
import {
	type ProfileHubTab,
	buildProfileCardContainer,
	calculateRequiredAffectionForBond,
} from '../../commands/user/profile.ts';
import { type SettingsHubTab, buildSettingsCardContainer } from '../../commands/user/settings.ts';
import { PROGRESSION_LIMITS } from '../../config/constants.ts';
import { db } from '../../db/index.ts';
import { companions, userSettings, users } from '../../db/schema/index.ts';
import { CAREER_CATALOG, EXPEDITION_ZONES } from '../../db/seed.ts';
import { encodeCustomId } from '../../lib/cv2/CustomId.ts';
import { checkAndSetCooldown } from '../../lib/redis.ts';
import { calculateRequiredXpForLevel } from '../../utilities/ContextUtility.ts';

export class ProfileAndSettingsHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.MessageComponent,
		});
	}

	public override parse(
		interaction: ButtonInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction,
	) {
		const prefix = interaction.customId.split(':')[0];
		if (prefix !== 'prf' && prefix !== 'set') {
			return this.none();
		}
		return this.some();
	}

	public override async run(
		interaction: ButtonInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction,
	): Promise<void> {
		const validation = this.container.cv2.validateInteractionAccess(
			interaction.customId,
			interaction.user.id,
		);

		if (!validation.ok) {
			await this.container.cv2.notify(interaction, {
				status: validation.reason === 'NOT_OWNER' ? 'ACCESS DENIED' : 'EXPIRED',
				title:
					validation.reason === 'NOT_OWNER'
						? 'Dashboard Locked to Owner'
						: 'Dashboard Session Expired',
				message:
					validation.reason === 'NOT_OWNER'
						? 'Run `/profile` or `/settings` to open your own personal hub.'
						: 'This view expired after 14 minutes. Run the command again to refresh.',
				ephemeral: true,
			});
			return;
		}

		const { domain, action, ownerId, state, extra, createdAtMs } = validation.data;

		// =========================================================================
		// 1. /settings Hub Actions
		// =========================================================================
		if (domain === 'set') {
			const lock = await this.container.context.acquireActionLock(ownerId);
			if (!lock.acquired) return;

			try {
				const ctx = await this.container.context.getUserContext(ownerId);
				let tab: SettingsHubTab = 'general';
				let footerNotice: string | undefined;

				if (action === 'tab') {
					tab = (state as SettingsHubTab) || 'general';
				} else if (action === 'lang') {
					const nextLang = state === 'ENGLISH' ? 'ENGLISH' : 'ROMAJI';
					ctx.settings.titleLanguage = nextLang;
					await db
						.update(userSettings)
						.set({ titleLanguage: nextLang, updatedAt: new Date() })
						.where(eq(userSettings.userId, ownerId))
						.catch(() => {});
					footerNotice = `Title language changed to ${nextLang}`;
				} else if (action === 'tz' && interaction.isStringSelectMenu()) {
					const nextTz = interaction.values[0] ?? 'UTC';
					ctx.settings.timezone = nextTz;
					await db
						.update(userSettings)
						.set({ timezone: nextTz, updatedAt: new Date() })
						.where(eq(userSettings.userId, ownerId))
						.catch(() => {});
					footerNotice = `Timezone updated to ${nextTz}`;
				} else if (action === 'toggle') {
					tab = (extra as SettingsHubTab) || 'general';
					const toggleField = state as
						| 'compactMode'
						| 'levelUpAlerts'
						| 'airingDmAlerts'
						| 'expeditionDmAlerts'
						| 'loanReminderAlerts'
						| 'publicWallet'
						| 'allowTradeRequests'
						| 'allowBorrowRequests';

					if (toggleField in ctx.settings) {
						const nextVal = !ctx.settings[toggleField];
						ctx.settings[toggleField] = nextVal;
						await db
							.update(userSettings)
							.set({ [toggleField]: nextVal, updatedAt: new Date() })
							.where(eq(userSettings.userId, ownerId))
							.catch(() => {});
						footerNotice = `${toggleField} set to ${nextVal ? 'ENABLED' : 'DISABLED'}`;
					}
				}

				const container = buildSettingsCardContainer({
					ownerId,
					settings: ctx.settings,
					tab,
					footerNotice,
					createdAtMs,
				});

				await interaction.update({
					flags: MessageFlags.IsComponentsV2,
					components: [container],
				});
			} finally {
				await lock.release();
			}
			return;
		}

		// =========================================================================
		// 2. /profile Hub Actions
		// =========================================================================
		let targetUserId = extra || ownerId;
		let targetUsername = interaction.user.username;
		let targetAvatarUrl = interaction.user.displayAvatarURL({ size: 256 });

		if (action === 'inspect' && interaction.isUserSelectMenu()) {
			const pickedUser = interaction.users.first();
			if (pickedUser) {
				targetUserId = pickedUser.id;
				targetUsername = pickedUser.username;
				targetAvatarUrl = pickedUser.displayAvatarURL({ size: 256 });
			}
		} else if (targetUserId !== ownerId) {
			const fetched = await interaction.client.users.fetch(targetUserId).catch(() => null);
			if (fetched) {
				targetUsername = fetched.username;
				targetAvatarUrl = fetched.displayAvatarURL({ size: 256 });
			}
		}

		// Open Bio Edit Modal
		if (action === 'openbio' && interaction.isButton()) {
			const ctx = await this.container.context.getUserContext(ownerId);
			const modal = new ModalBuilder()
				.setCustomId(
					encodeCustomId({
						domain: 'prf',
						action: 'biomodal',
						ownerId,
						state: 'customize',
						extra: ownerId,
						createdAtMs,
					}),
				)
				.setTitle('Edit Neko Profile Bio');

			const bioInput = new TextInputBuilder()
				.setCustomId('bio_text')
				.setLabel('Profile Biography (Max 240 characters)')
				.setStyle(TextInputStyle.Paragraph)
				.setMinLength(1)
				.setMaxLength(240)
				.setValue(ctx.user.bio)
				.setRequired(true);

			modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(bioInput));

			await interaction.showModal(modal);
			return;
		}

		const lock = await this.container.context.acquireActionLock(ownerId);
		if (!lock.acquired) return;

		try {
			const ctx = await this.container.context.getUserContext(targetUserId);
			let tab: ProfileHubTab = 'overview';
			let footerNotice: string | undefined;

			if (action === 'tab') {
				tab = (state as ProfileHubTab) || 'overview';
			} else if (action === 'pat' && targetUserId === ownerId) {
				tab = 'companion';
				const cd = await checkAndSetCooldown(`pat:${ownerId}`, 1_800_000);
				if (cd.onCooldown) {
					await this.container.cv2.notify(interaction, {
						status: 'COOLDOWN',
						title: 'Companion Still Purring',
						message: `You can headpat **${ctx.companion.partnerName}** again in **${this.container.cv2.formatDurationCompact(cd.remainingMs)}** (${this.container.cv2.discordTime(cd.expiresAtUnix, 'R')}).`,
						ephemeral: true,
					});
					return;
				}

				const gainedAff = 25;
				let nextAff = ctx.companion.affectionXp + gainedAff;
				let nextBond = ctx.companion.bondLevel;
				const reqAff = calculateRequiredAffectionForBond(nextBond);
				if (nextAff >= reqAff && nextBond < PROGRESSION_LIMITS.MAX_COMPANION_BOND_LEVEL) {
					nextAff -= reqAff;
					nextBond += 1;
				}

				ctx.companion.affectionXp = nextAff;
				ctx.companion.bondLevel = nextBond;
				ctx.companion.mood = Math.min(100, ctx.companion.mood + 10);

				await db
					.update(companions)
					.set({
						affectionXp: nextAff,
						bondLevel: nextBond,
						mood: ctx.companion.mood,
						lastHeadpatAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(companions.userId, ownerId))
					.catch(() => {});

				footerNotice = `Gave ${ctx.companion.partnerName} headpats (+25 AFF)`;
			} else if (action === 'feed' && targetUserId === ownerId) {
				tab = 'companion';
				const snackCost = 250;
				if (ctx.user.coins < snackCost) {
					await this.container.cv2.notify(interaction, {
						status: 'ERROR',
						title: 'Insufficient Coins for Taiyaki',
						message: `Feeding **Matcha Taiyaki** costs **${snackCost} Coins** (You have \`${ctx.user.coins.toLocaleString()} Coins\`). Work a shift in \`CAREER\` or visit \`/matsuri\` first!`,
						ephemeral: true,
					});
					return;
				}

				const gainedAff = 50;
				let nextAff = ctx.companion.affectionXp + gainedAff;
				let nextBond = ctx.companion.bondLevel;
				const reqAff = calculateRequiredAffectionForBond(nextBond);
				if (nextAff >= reqAff && nextBond < PROGRESSION_LIMITS.MAX_COMPANION_BOND_LEVEL) {
					nextAff -= reqAff;
					nextBond += 1;
				}

				ctx.user.coins -= snackCost;
				ctx.companion.affectionXp = nextAff;
				ctx.companion.bondLevel = nextBond;
				ctx.companion.mood = 100;

				await db
					.transaction(async (tx) => {
						await tx
							.update(users)
							.set({
								coins: sql`${users.coins} - ${snackCost}`,
								updatedAt: new Date(),
							})
							.where(eq(users.id, ownerId));
						await tx
							.update(companions)
							.set({
								affectionXp: nextAff,
								bondLevel: nextBond,
								mood: 100,
								lastFedAt: new Date(),
								updatedAt: new Date(),
							})
							.where(eq(companions.userId, ownerId));
					})
					.catch(() => {});

				footerNotice = `Fed Matcha Taiyaki (+50 AFF • -${snackCost} Coins)`;
			} else if ((action === 'expstart' || action === 'expzone') && targetUserId === ownerId) {
				tab = 'companion';
				const pickedZoneId =
					action === 'expzone' && interaction.isStringSelectMenu()
						? (interaction.values[0] ?? EXPEDITION_ZONES[0]!.id)
						: state || EXPEDITION_ZONES[0]!.id;
				const zone = EXPEDITION_ZONES.find((z) => z.id === pickedZoneId) ?? EXPEDITION_ZONES[0]!;

				if (ctx.companion.bondLevel < zone.minBondLevel) {
					await this.container.cv2.notify(interaction, {
						status: 'ACCESS DENIED',
						title: 'Bond Level Too Low',
						message: `**${zone.name}** requires **Companion Bond Lv. ${zone.minBondLevel}** (Currently Lv. ${ctx.companion.bondLevel}).`,
						ephemeral: true,
					});
					return;
				}

				const now = new Date();
				const endsAt = new Date(now.getTime() + zone.durationSeconds * 1_000);
				ctx.companion.expeditionZoneId = zone.id;
				ctx.companion.expeditionStartedAt = now;
				ctx.companion.expeditionEndsAt = endsAt;

				await db
					.update(companions)
					.set({
						expeditionZoneId: zone.id,
						expeditionStartedAt: now,
						expeditionEndsAt: endsAt,
						updatedAt: now,
					})
					.where(eq(companions.userId, ownerId))
					.catch(() => {});

				footerNotice = `Dispatched ${ctx.companion.partnerName} to ${zone.name}`;
			} else if (action === 'expclaim' && targetUserId === ownerId) {
				tab = 'companion';
				const zone =
					EXPEDITION_ZONES.find((z) => z.id === ctx.companion.expeditionZoneId) ??
					EXPEDITION_ZONES[0]!;
				const baseShards =
					Math.floor(Math.random() * (zone.maxShards - zone.minShards + 1)) + zone.minShards;
				const starBonus = Math.round(baseShards * (ctx.companion.partnerStars - 1) * 0.1);
				const totalShards = baseShards + starBonus;

				ctx.user.shards += totalShards;
				ctx.companion.expeditionZoneId = null;
				ctx.companion.expeditionStartedAt = null;
				ctx.companion.expeditionEndsAt = null;

				await db
					.transaction(async (tx) => {
						await tx
							.update(users)
							.set({
								shards: sql`${users.shards} + ${totalShards}`,
								updatedAt: new Date(),
							})
							.where(eq(users.id, ownerId));
						await tx
							.update(companions)
							.set({
								expeditionZoneId: null,
								expeditionStartedAt: null,
								expeditionEndsAt: null,
								updatedAt: new Date(),
							})
							.where(eq(companions.userId, ownerId));
					})
					.catch(() => {});

				footerNotice = `Claimed +${totalShards} Shards from ${zone.name}`;
			} else if (action === 'work' && targetUserId === ownerId) {
				tab = 'career';
				const activeCareer =
					CAREER_CATALOG.find((c) => c.id === ctx.user.careerId) ?? CAREER_CATALOG[0]!;
				const cd = await checkAndSetCooldown(
					`work:${ownerId}`,
					activeCareer.cooldownSeconds * 1_000,
				);
				if (cd.onCooldown) {
					await this.container.cv2.notify(interaction, {
						status: 'COOLDOWN',
						title: 'Career Shift on Break',
						message: `Your next **${activeCareer.name}** shift begins in **${this.container.cv2.formatDurationCompact(cd.remainingMs)}** (${this.container.cv2.discordTime(cd.expiresAtUnix, 'R')}).`,
						ephemeral: true,
					});
					return;
				}

				const levelMultiplier = 1 + (ctx.user.careerLevel - 1) * 0.04;
				const earnedCoins = Math.round(
					activeCareer.baseCoins * levelMultiplier * (1 + ctx.effectiveCoinMultiplierBonus),
				);
				const earnedXp = Math.round(
					activeCareer.baseXp * levelMultiplier * (1 + ctx.effectiveXpMultiplierBonus),
				);

				ctx.user.coins += earnedCoins;
				ctx.user.xp += earnedXp;
				ctx.user.careerXp += 25;

				const reqUserXp = calculateRequiredXpForLevel(ctx.user.level);
				if (ctx.user.xp >= reqUserXp && ctx.user.level < PROGRESSION_LIMITS.MAX_USER_LEVEL) {
					ctx.user.xp -= reqUserXp;
					ctx.user.level += 1;
				}
				if (
					ctx.user.careerXp >= ctx.user.careerLevel * 100 &&
					ctx.user.careerLevel < PROGRESSION_LIMITS.MAX_CAREER_LEVEL
				) {
					ctx.user.careerXp = 0;
					ctx.user.careerLevel += 1;
				}

				await db
					.update(users)
					.set({
						coins: sql`${users.coins} + ${earnedCoins}`,
						xp: ctx.user.xp,
						level: ctx.user.level,
						careerXp: ctx.user.careerXp,
						careerLevel: ctx.user.careerLevel,
						updatedAt: new Date(),
					})
					.where(eq(users.id, ownerId))
					.catch(() => {});

				footerNotice = `Shift complete! Earned +${earnedCoins.toLocaleString()} Coins & +${earnedXp} XP`;
			} else if (
				action === 'setcareer' &&
				interaction.isStringSelectMenu() &&
				targetUserId === ownerId
			) {
				tab = 'career';
				const nextCareerId = interaction.values[0] ?? CAREER_CATALOG[0]!.id;
				const careerDef = CAREER_CATALOG.find((c) => c.id === nextCareerId);
				if (!careerDef || ctx.user.level < careerDef.minUserLevel) {
					await this.container.cv2.notify(interaction, {
						status: 'ACCESS DENIED',
						title: 'Career Locked',
						message: `You must reach **Level ${careerDef?.minUserLevel ?? 1}** before specializing as a **${careerDef?.name ?? 'Specialist'}**.`,
						ephemeral: true,
					});
					return;
				}

				ctx.user.careerId = careerDef.id;
				await db
					.update(users)
					.set({ careerId: careerDef.id, updatedAt: new Date() })
					.where(eq(users.id, ownerId))
					.catch(() => {});

				footerNotice = `Switched active career to ${careerDef.name}`;
			} else if (
				action === 'settitle' &&
				interaction.isStringSelectMenu() &&
				targetUserId === ownerId
			) {
				tab = 'customize';
				const nextTitle = interaction.values[0] ?? '[ NEKO ] Stray Kitten';
				ctx.user.equippedTitle = nextTitle;

				await db
					.update(users)
					.set({ equippedTitle: nextTitle, updatedAt: new Date() })
					.where(eq(users.id, ownerId))
					.catch(() => {});

				footerNotice = `Equipped title ${nextTitle}`;
			}

			const container = buildProfileCardContainer({
				ownerId,
				targetUserId,
				targetUsername,
				targetAvatarUrl,
				ctx,
				tab,
				footerNotice,
				createdAtMs,
			});

			await interaction.update({
				flags: MessageFlags.IsComponentsV2,
				components: [container],
			});
		} finally {
			await lock.release();
		}
	}
}
