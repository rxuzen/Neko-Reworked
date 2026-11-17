import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
	type ButtonInteraction,
	type ChannelSelectMenuInteraction,
	MessageFlags,
	type UserSelectMenuInteraction,
} from 'discord.js';
import { desc, eq } from 'drizzle-orm';
import {
	type StaffHubTab,
	buildStaffCardContainer,
	createDefaultGuildConfig,
} from '../../commands/staff/staff.ts';
import { db } from '../../db/index.ts';
import { audits, guilds } from '../../db/schema/index.ts';
import { l1Cache, resetCircuitBreaker } from '../../lib/cache.ts';
import { hasRequiredStaffTier, resolveMemberStaffTier } from '../../preconditions/StaffTier.ts';

export class StaffHubHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.MessageComponent,
		});
	}

	public override parse(
		interaction: ButtonInteraction | ChannelSelectMenuInteraction | UserSelectMenuInteraction,
	) {
		if (!interaction.customId.startsWith('stf:')) {
			return this.none();
		}
		return this.some();
	}

	public override async run(
		interaction: ButtonInteraction | ChannelSelectMenuInteraction | UserSelectMenuInteraction,
	): Promise<void> {
		const validation = this.container.cv2.validateInteractionAccess(
			interaction.customId,
			interaction.user.id,
		);

		if (!validation.ok) {
			await this.container.cv2.notify(interaction, {
				status: validation.reason === 'NOT_OWNER' ? 'ACCESS DENIED' : 'EXPIRED',
				title: 'Staff Session Invalid',
				message: 'Run `/staff` to open your own authenticated staff panel.',
				ephemeral: true,
			});
			return;
		}

		const { action, ownerId, state, extra, createdAtMs } = validation.data;
		const staffTier = resolveMemberStaffTier(ownerId, interaction.memberPermissions);

		if (!staffTier) {
			await this.container.cv2.notify(interaction, {
				status: 'ACCESS DENIED',
				title: 'Clearance Revoked',
				message: 'You no longer have staff permissions for this panel.',
				ephemeral: true,
			});
			return;
		}

		const lock = await this.container.context.acquireActionLock(ownerId);
		if (!lock.acquired) return;

		try {
			const guildId = interaction.guildId ?? 'GLOBAL';
			const existingRows = await db
				.select()
				.from(guilds)
				.where(eq(guilds.id, guildId))
				.limit(1)
				.catch(() => []);
			const guildConfig = existingRows[0] ?? createDefaultGuildConfig(guildId);

			let tab: StaffHubTab = (state as StaffHubTab) || 'mod';
			let selectedModTargetId = extra && extra !== '_' ? extra : null;
			let footerNotice: string | undefined;

			if (action === 'tab') {
				tab = (state as StaffHubTab) || 'mod';
			} else if (action === 'selectuser' && interaction.isUserSelectMenu()) {
				tab = 'mod';
				selectedModTargetId = interaction.users.first()?.id ?? null;
				footerNotice = selectedModTargetId
					? `Selected member ${selectedModTargetId} for moderation`
					: undefined;
			} else if (action === 'warn' && selectedModTargetId) {
				tab = 'mod';
				await db
					.insert(audits)
					.values({
						guildId,
						actorId: ownerId,
						targetId: selectedModTargetId,
						category: 'MOD',
						action: 'MEMBER_WARN',
						reason: 'Logged via /staff MOD panel',
					})
					.catch(() => {});
				footerNotice = `Logged warning case against ${selectedModTargetId}`;
			} else if (
				(action === 'airchan' ||
					action === 'clearair' ||
					action === 'automod' ||
					action === 'xpboost') &&
				hasRequiredStaffTier(staffTier, 'ADMIN')
			) {
				tab = 'admin';
				if (action === 'airchan' && interaction.isChannelSelectMenu()) {
					const pickedChanId = interaction.values[0] ?? null;
					guildConfig.airingChannelId = pickedChanId;
					footerNotice = pickedChanId
						? `Bound Server Anime Airing Feed to #${pickedChanId}`
						: 'Cleared Server Airing Feed';
				} else if (action === 'clearair') {
					guildConfig.airingChannelId = null;
					footerNotice = 'Disabled Server Anime Airing Notification Feed';
				} else if (action === 'automod') {
					guildConfig.automodEnabled = !guildConfig.automodEnabled;
					footerNotice = `Automod set to ${guildConfig.automodEnabled ? 'ENABLED' : 'DISABLED'}`;
				} else if (action === 'xpboost') {
					const cycle = [0, 0.25, 0.5];
					const idx = cycle.indexOf(guildConfig.xpBoostOverride);
					guildConfig.xpBoostOverride = cycle[(idx + 1) % cycle.length] ?? 0;
					footerNotice = `Server XP Override set to +${Math.round(guildConfig.xpBoostOverride * 100)}%`;
				}

				await db
					.insert(guilds)
					.values(guildConfig)
					.onConflictDoUpdate({
						target: guilds.id,
						set: {
							airingChannelId: guildConfig.airingChannelId,
							automodEnabled: guildConfig.automodEnabled,
							xpBoostOverride: guildConfig.xpBoostOverride,
							updatedAt: new Date(),
						},
					})
					.catch(() => {});

				await db
					.insert(audits)
					.values({
						guildId,
						actorId: ownerId,
						category: 'ADMIN',
						action: `CONFIG_${action.toUpperCase()}`,
					})
					.catch(() => {});
			} else if (
				(action === 'flushcache' || action === 'resetcb') &&
				hasRequiredStaffTier(staffTier, 'OWNER')
			) {
				tab = 'owner';
				if (action === 'flushcache') {
					l1Cache.clear();
					footerNotice = 'Flushed L1 in-memory cache';
				} else {
					for (const svc of ['anilist', 'animethemes', 'saucenao', 'pokeapi', 'nekosbest']) {
						resetCircuitBreaker(svc);
					}
					footerNotice = 'Reset all external API circuit breakers to CLOSED';
				}

				await db
					.insert(audits)
					.values({
						guildId,
						actorId: ownerId,
						category: 'OWNER',
						action: action.toUpperCase(),
					})
					.catch(() => {});
			}

			const auditRows = await db
				.select()
				.from(audits)
				.orderBy(desc(audits.id))
				.limit(6)
				.catch(() => []);

			const container = buildStaffCardContainer({
				ownerId,
				staffTier,
				tab,
				guildConfig,
				auditRows,
				selectedModTargetId,
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
