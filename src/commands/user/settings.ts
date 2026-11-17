import { Command } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ContainerBuilder,
	type MessageActionRowComponentBuilder,
	MessageFlags,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from 'discord.js';
import type { UserSettingsRow } from '../../db/schema/index.ts';
import { encodeCustomId } from '../../lib/cv2/CustomId.ts';
import { type NekoFieldOption, createNekoContainer } from '../../lib/cv2/NekoLayout.ts';
import { statusFooter } from '../../lib/cv2/TimeAndStatus.ts';

export type SettingsHubTab = 'general' | 'notifications' | 'privacy';

export const SUPPORTED_TIMEZONES = [
	{ value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
	{ value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST • UTC+9)' },
	{ value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
	{ value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT)' },
	{ value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
	{ value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST)' },
	{ value: 'Asia/Singapore', label: 'Asia/Singapore (SGT • UTC+8)' },
	{ value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT)' },
] as const;

export interface BuildSettingsCardOptions {
	ownerId: string;
	settings: UserSettingsRow;
	tab: SettingsHubTab;
	footerNotice?: string;
	createdAtMs?: number;
}

function formatToggleBadge(enabled: boolean): string {
	return enabled ? '`[ ENABLED ]`' : '`[ DISABLED ]`';
}

export function buildSettingsCardContainer(options: BuildSettingsCardOptions): ContainerBuilder {
	const createdAtMs = options.createdAtMs ?? Date.now();
	const { ownerId, settings, tab } = options;

	const tabs = (['general', 'notifications', 'privacy'] as const).map((t) => ({
		customId: encodeCustomId({
			domain: 'set',
			action: 'tab',
			ownerId,
			state: t,
			extra: '_',
			createdAtMs,
		}),
		label: t.toUpperCase(),
		active: tab === t,
	}));

	const fields: NekoFieldOption[] = [];
	const controls: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

	if (tab === 'general') {
		fields.push({
			key: 'DISPLAY & REGIONAL PREFERENCES',
			value: [
				`**Title Language Mode:** \`${settings.titleLanguage}\` (controls Romaji vs English titles in \`/anime\`, \`/manga\`, and \`/schedule\`)`,
				`**Personal Timezone:** \`${settings.timezone}\` (adjusts airing schedule broadcast times)`,
				`**Compact Card Mode:** ${formatToggleBadge(settings.compactMode)}`,
			].join('\n'),
		});

		const romajiBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'set',
					action: 'lang',
					ownerId,
					state: 'ROMAJI',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Title: Romaji')
			.setStyle(settings.titleLanguage === 'ROMAJI' ? ButtonStyle.Primary : ButtonStyle.Secondary);

		const englishBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'set',
					action: 'lang',
					ownerId,
					state: 'ENGLISH',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Title: English')
			.setStyle(settings.titleLanguage === 'ENGLISH' ? ButtonStyle.Primary : ButtonStyle.Secondary);

		const compactBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'set',
					action: 'toggle',
					ownerId,
					state: 'compactMode',
					extra: 'general',
					createdAtMs,
				}),
			)
			.setLabel(`Compact Mode: ${settings.compactMode ? 'ON' : 'OFF'}`)
			.setStyle(settings.compactMode ? ButtonStyle.Primary : ButtonStyle.Secondary);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				romajiBtn,
				englishBtn,
				compactBtn,
			),
		);

		const tzSelect = new StringSelectMenuBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'set',
					action: 'tz',
					ownerId,
					state: 'general',
					extra: '_',
					createdAtMs,
				}),
			)
			.setPlaceholder('Select your personal timezone...')
			.addOptions(
				SUPPORTED_TIMEZONES.map((tz) =>
					new StringSelectMenuOptionBuilder()
						.setValue(tz.value)
						.setLabel(tz.label)
						.setDefault(tz.value === settings.timezone),
				),
			);

		controls.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(tzSelect));
	} else if (tab === 'notifications') {
		fields.push({
			key: 'DIRECT MESSAGE & ALERT PREFERENCES',
			value: [
				`**Level-Up & Career Alerts:** ${formatToggleBadge(settings.levelUpAlerts)}`,
				`**Watchlist Airing DMs:** ${formatToggleBadge(settings.airingDmAlerts)}`,
				`**Neko Expedition Return DMs:** ${formatToggleBadge(settings.expeditionDmAlerts)}`,
				`**Economy Loan Due Reminders:** ${formatToggleBadge(settings.loanReminderAlerts)}`,
			].join('\n'),
		});

		const lvlBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'set',
					action: 'toggle',
					ownerId,
					state: 'levelUpAlerts',
					extra: 'notifications',
					createdAtMs,
				}),
			)
			.setLabel(`Level Alerts: ${settings.levelUpAlerts ? 'ON' : 'OFF'}`)
			.setStyle(settings.levelUpAlerts ? ButtonStyle.Primary : ButtonStyle.Secondary);

		const airBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'set',
					action: 'toggle',
					ownerId,
					state: 'airingDmAlerts',
					extra: 'notifications',
					createdAtMs,
				}),
			)
			.setLabel(`Airing DMs: ${settings.airingDmAlerts ? 'ON' : 'OFF'}`)
			.setStyle(settings.airingDmAlerts ? ButtonStyle.Primary : ButtonStyle.Secondary);

		const expBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'set',
					action: 'toggle',
					ownerId,
					state: 'expeditionDmAlerts',
					extra: 'notifications',
					createdAtMs,
				}),
			)
			.setLabel(`Expedition DMs: ${settings.expeditionDmAlerts ? 'ON' : 'OFF'}`)
			.setStyle(settings.expeditionDmAlerts ? ButtonStyle.Primary : ButtonStyle.Secondary);

		const loanBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'set',
					action: 'toggle',
					ownerId,
					state: 'loanReminderAlerts',
					extra: 'notifications',
					createdAtMs,
				}),
			)
			.setLabel(`Loan Reminders: ${settings.loanReminderAlerts ? 'ON' : 'OFF'}`)
			.setStyle(settings.loanReminderAlerts ? ButtonStyle.Primary : ButtonStyle.Secondary);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				lvlBtn,
				airBtn,
				expBtn,
				loanBtn,
			),
		);
	} else {
		fields.push({
			key: 'PRIVACY & SOCIAL SAFEGUARDS',
			value: [
				`**Public Wallet Visibility:** ${formatToggleBadge(settings.publicWallet)} (when disabled, others inspecting your \`/profile\` cannot view your Coin, Vault, Gem, or Shard balances)`,
				`**Allow Gacha Card Trade Requests:** ${formatToggleBadge(settings.allowTradeRequests)}`,
				`**Allow Economy Loan / Borrow Requests:** ${formatToggleBadge(settings.allowBorrowRequests)}`,
			].join('\n'),
		});

		const walletBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'set',
					action: 'toggle',
					ownerId,
					state: 'publicWallet',
					extra: 'privacy',
					createdAtMs,
				}),
			)
			.setLabel(`Public Wallet: ${settings.publicWallet ? 'ON' : 'OFF'}`)
			.setStyle(settings.publicWallet ? ButtonStyle.Primary : ButtonStyle.Secondary);

		const tradeBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'set',
					action: 'toggle',
					ownerId,
					state: 'allowTradeRequests',
					extra: 'privacy',
					createdAtMs,
				}),
			)
			.setLabel(`Trade Requests: ${settings.allowTradeRequests ? 'ON' : 'OFF'}`)
			.setStyle(settings.allowTradeRequests ? ButtonStyle.Primary : ButtonStyle.Secondary);

		const borrowBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'set',
					action: 'toggle',
					ownerId,
					state: 'allowBorrowRequests',
					extra: 'privacy',
					createdAtMs,
				}),
			)
			.setLabel(`Loan Requests: ${settings.allowBorrowRequests ? 'ON' : 'OFF'}`)
			.setStyle(settings.allowBorrowRequests ? ButtonStyle.Primary : ButtonStyle.Secondary);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				walletBtn,
				tradeBtn,
				borrowBtn,
			),
		);
	}

	const footer = options.footerNotice
		? statusFooter('UPDATED', options.footerNotice)
		: statusFooter('CONFIRMED', 'Personal preferences loaded');

	return createNekoContainer({
		title: 'User Preferences & Privacy Settings',
		subtitle: `Language: ${settings.titleLanguage}  |  Timezone: ${settings.timezone}  |  Wallet: ${settings.publicWallet ? 'Public' : 'Private'}`,
		tabs,
		fields,
		controls,
		footer,
	});
}

export class SettingsCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'settings',
			description:
				'Configure your personal title language, timezone, DM notifications, and wallet privacy.',
			cooldownDelay: 2_000,
		});
	}

	public override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerChatInputCommand((builder) =>
			builder.setName(this.name).setDescription(this.description),
		);
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		const ctx = await this.container.context.getUserContext(interaction.user.id);

		const container = buildSettingsCardContainer({
			ownerId: interaction.user.id,
			settings: ctx.settings,
			tab: 'general',
		});

		await interaction.reply({
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			components: [container],
		});
	}
}
