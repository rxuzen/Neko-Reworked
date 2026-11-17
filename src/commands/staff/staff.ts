import { Command } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelSelectMenuBuilder,
	ChannelType,
	type ContainerBuilder,
	type MessageActionRowComponentBuilder,
	MessageFlags,
	PermissionFlagsBits,
	UserSelectMenuBuilder,
} from 'discord.js';
import { desc, eq } from 'drizzle-orm';
import { BOT_NAME, BOT_VERSION } from '../../config/constants.ts';
import { db } from '../../db/index.ts';
import { type AuditRow, type GuildRow, audits, guilds } from '../../db/schema/index.ts';
import { getCircuitState, l1Cache } from '../../lib/cache.ts';
import { encodeCustomId } from '../../lib/cv2/CustomId.ts';
import { formatAlignedRows } from '../../lib/cv2/Formatters.ts';
import { type NekoFieldOption, createNekoContainer } from '../../lib/cv2/NekoLayout.ts';
import { formatDurationCompact, statusFooter } from '../../lib/cv2/TimeAndStatus.ts';
import { redis } from '../../lib/redis.ts';
import {
	type StaffTierLevel,
	hasRequiredStaffTier,
	resolveMemberStaffTier,
} from '../../preconditions/StaffTier.ts';

export type StaffHubTab = 'mod' | 'admin' | 'owner';

export function createDefaultGuildConfig(guildId: string, now: Date = new Date()): GuildRow {
	return {
		id: guildId,
		airingChannelId: null,
		automodEnabled: false,
		economyTaxRate: 0.05,
		xpBoostOverride: 0,
		coinBoostOverride: 0,
		createdAt: now,
		updatedAt: now,
	};
}

export interface BuildStaffCardOptions {
	ownerId: string;
	staffTier: StaffTierLevel;
	tab: StaffHubTab;
	guildConfig: GuildRow;
	auditRows: readonly AuditRow[];
	selectedModTargetId?: string | null;
	footerNotice?: string;
	createdAtMs?: number;
}

const MONITORED_SERVICES = ['anilist', 'animethemes', 'saucenao', 'pokeapi', 'nekosbest'] as const;

export function buildStaffCardContainer(options: BuildStaffCardOptions): ContainerBuilder {
	const createdAtMs = options.createdAtMs ?? Date.now();
	const { ownerId, staffTier, tab, guildConfig, auditRows } = options;

	const tabDefs: Array<{
		key: StaffHubTab;
		label: string;
		minTier: StaffTierLevel;
	}> = [
		{ key: 'mod', label: 'MOD', minTier: 'MOD' },
		{ key: 'admin', label: 'ADMIN', minTier: 'ADMIN' },
		{ key: 'owner', label: 'OWNER', minTier: 'OWNER' },
	];

	const tabs = tabDefs.map((t) => ({
		customId: encodeCustomId({
			domain: 'stf',
			action: 'tab',
			ownerId,
			state: t.key,
			extra: options.selectedModTargetId ?? '_',
			createdAtMs,
		}),
		label: t.label,
		active: tab === t.key,
		disabled: !hasRequiredStaffTier(staffTier, t.minTier),
	}));

	const fields: NekoFieldOption[] = [];
	const controls: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

	if (tab === 'mod') {
		const targetLine = options.selectedModTargetId
			? `<@${options.selectedModTargetId}>`
			: 'None selected';

		fields.push({
			key: 'MODERATION & CASE DISPATCH',
			value: [
				`**Selected Member:** ${targetLine}`,
				'Select a member below and click **[ Log Warning Case ]** to record an official server warning in the PostgreSQL audit ledger.',
			].join('\n'),
		});

		const logRows =
			auditRows.length > 0
				? formatAlignedRows(
						auditRows.slice(0, 6).map((a) => ({
							label: `#${a.id} [${a.category}]`,
							value: `${a.action} | Actor: ${a.actorId.slice(-4)} -> ${a.targetId?.slice(-4) ?? 'SYS'}`,
						})),
					)
				: 'No moderation or audit cases recorded yet.';

		fields.push({
			key: 'RECENT AUDIT & CASE LOGS',
			value: logRows,
			codeBlock: true,
		});

		const userSelect = new UserSelectMenuBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'stf',
					action: 'selectuser',
					ownerId,
					state: 'mod',
					extra: options.selectedModTargetId ?? '_',
					createdAtMs,
				}),
			)
			.setPlaceholder('Select a member to log a moderation warning...');

		const warnBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'stf',
					action: 'warn',
					ownerId,
					state: 'mod',
					extra: options.selectedModTargetId ?? '_',
					createdAtMs,
				}),
			)
			.setLabel('Log Warning Case')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(!options.selectedModTargetId);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(userSelect),
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(warnBtn),
		);
	} else if (tab === 'admin') {
		const airingChannelDisplay = guildConfig.airingChannelId
			? `<#${guildConfig.airingChannelId}>`
			: 'Not Configured (Select a channel below)';
		const xpOverridePct = Math.round(guildConfig.xpBoostOverride * 100);
		const coinOverridePct = Math.round(guildConfig.coinBoostOverride * 100);

		fields.push({
			key: 'SERVER-WIDE ANIME AIRING NOTIFICATION FEED',
			value: [
				`**Bound Feed Channel:** ${airingChannelDisplay}`,
				'When configured, `AiringScheduleNotifier` automatically posts a colorless CV2 broadcast card to this channel whenever a tracked seasonal anime airs a new episode.',
			].join('\n'),
		});

		const adminTable = formatAlignedRows([
			{
				label: 'Automod Filter',
				value: guildConfig.automodEnabled ? 'ENABLED' : 'DISABLED',
			},
			{
				label: 'Guild Tax Rate',
				value: `${(guildConfig.economyTaxRate * 100).toFixed(1)}%`,
			},
			{
				label: 'Server XP Override',
				value: `+${xpOverridePct}% XP`,
			},
			{
				label: 'Server Coin Override',
				value: `+${coinOverridePct}% Coins`,
			},
		]);

		fields.push({
			key: 'GUILD AUTOMOD & ECONOMY OVERRIDES',
			value: adminTable,
			codeBlock: true,
		});

		const channelSelect = new ChannelSelectMenuBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'stf',
					action: 'airchan',
					ownerId,
					state: 'admin',
					extra: '_',
					createdAtMs,
				}),
			)
			.setPlaceholder('Select a channel for Server Anime Airing Notifications...')
			.setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

		const automodBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'stf',
					action: 'automod',
					ownerId,
					state: 'admin',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel(`Automod: ${guildConfig.automodEnabled ? 'ON' : 'OFF'}`)
			.setStyle(guildConfig.automodEnabled ? ButtonStyle.Primary : ButtonStyle.Secondary);

		const boostBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'stf',
					action: 'xpboost',
					ownerId,
					state: 'admin',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Cycle Server XP Boost (+0% / +25% / +50%)')
			.setStyle(ButtonStyle.Secondary);

		const clearChanBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'stf',
					action: 'clearair',
					ownerId,
					state: 'admin',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Disable Airing Feed')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(!guildConfig.airingChannelId);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(channelSelect),
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				automodBtn,
				boostBtn,
				clearChanBtn,
			),
		);
	} else {
		const mem = process.memoryUsage();
		const rssMb = (mem.rss / 1_024 / 1_024).toFixed(1);
		const heapMb = (mem.heapUsed / 1_024 / 1_024).toFixed(1);
		const uptimeStr = formatDurationCompact(Math.floor(process.uptime() * 1_000));

		const healthTable = formatAlignedRows([
			{ label: 'Runtime', value: `${BOT_NAME} v${BOT_VERSION} on Bun v${Bun.version}` },
			{ label: 'Memory (RSS / Heap)', value: `${rssMb} MB / ${heapMb} MB` },
			{ label: 'Uptime', value: uptimeStr },
			{ label: 'L1 Memory Cache', value: `${l1Cache.size} / 500 Entries` },
			{ label: 'L2 Redis Status', value: redis.status.toUpperCase() },
		]);

		fields.push({
			key: 'OWNER RUNTIME TELEMETRY',
			value: healthTable,
			codeBlock: true,
		});

		const cbRows = MONITORED_SERVICES.map((svc) => {
			const state = getCircuitState(svc);
			return {
				label: svc.toUpperCase(),
				value: state.isOpen
					? `OPEN (Fallback Active • ${state.failures} Failures)`
					: `CLOSED (Healthy • ${state.failures} Recent Errors)`,
			};
		});

		fields.push({
			key: 'EXTERNAL API CIRCUIT BREAKERS',
			value: formatAlignedRows(cbRows),
			codeBlock: true,
		});

		const flushCacheBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'stf',
					action: 'flushcache',
					ownerId,
					state: 'owner',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Flush L1 Memory Cache')
			.setStyle(ButtonStyle.Primary);

		const resetCbBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'stf',
					action: 'resetcb',
					ownerId,
					state: 'owner',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Reset All Circuit Breakers')
			.setStyle(ButtonStyle.Secondary);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				flushCacheBtn,
				resetCbBtn,
			),
		);
	}

	const footer = options.footerNotice
		? statusFooter('UPDATED', options.footerNotice)
		: statusFooter('CONFIRMED', `Staff Clearance: ${staffTier}`);

	return createNekoContainer({
		title: 'Neko Staff & System Control Panel',
		subtitle: `Clearance: ${staffTier}  |  Guild ID: ${guildConfig.id}`,
		tabs,
		fields,
		controls,
		footer,
	});
}

export class StaffCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'staff',
			description:
				'Open the role-gated Staff Control Panel for Moderation, Airing Channel Config, and Owner Telemetry.',
			preconditions: [{ name: 'StaffTier', context: { minTier: 'MOD' } }],
			cooldownDelay: 2_000,
		});
	}

	public override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
		);
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		const guildId = interaction.guildId ?? 'GLOBAL';
		const staffTier =
			resolveMemberStaffTier(interaction.user.id, interaction.memberPermissions) ?? 'MOD';

		const [guildRows, auditRows] = await Promise.all([
			db
				.select()
				.from(guilds)
				.where(eq(guilds.id, guildId))
				.limit(1)
				.catch(() => []),
			db
				.select()
				.from(audits)
				.orderBy(desc(audits.id))
				.limit(6)
				.catch(() => []),
		]);

		const guildConfig = guildRows[0] ?? createDefaultGuildConfig(guildId);

		const container = buildStaffCardContainer({
			ownerId: interaction.user.id,
			staffTier,
			tab: 'mod',
			guildConfig,
			auditRows,
		});

		await interaction.reply({
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			components: [container],
		});
	}
}
