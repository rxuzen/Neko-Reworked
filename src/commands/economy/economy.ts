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
	UserSelectMenuBuilder,
} from 'discord.js';
import { PROGRESSION_LIMITS } from '../../config/constants.ts';
import type { LoanRow, QuestRow } from '../../db/schema/index.ts';
import { SHOP_CATALOG } from '../../db/seed.ts';
import { encodeCustomId } from '../../lib/cv2/CustomId.ts';
import { formatAlignedRows, formatProgressBar } from '../../lib/cv2/Formatters.ts';
import { type NekoFieldOption, createNekoContainer } from '../../lib/cv2/NekoLayout.ts';
import { formatCountdown, formatStatus, statusFooter } from '../../lib/cv2/TimeAndStatus.ts';
import type { HydratedUserContext } from '../../utilities/ContextUtility.ts';

export type EconomyHubTab = 'wallet' | 'shop' | 'quests' | 'transfer';

export interface QuestDefinition {
	key: string;
	name: string;
	period: 'DAILY' | 'WEEKLY';
	target: number;
	rewardCoins: number;
	rewardShards: number;
}

export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
	{
		key: 'daily_work_shifts',
		name: 'Complete 2 Career Work Shifts',
		period: 'DAILY',
		target: 2,
		rewardCoins: 450,
		rewardShards: 5,
	},
	{
		key: 'daily_shrine_prayer',
		name: 'Visit the Matsuri Shrine & Hang an Ema Plaque',
		period: 'DAILY',
		target: 1,
		rewardCoins: 300,
		rewardShards: 5,
	},
	{
		key: 'daily_companion_care',
		name: 'Headpat or Feed Your Neko Companion',
		period: 'DAILY',
		target: 1,
		rewardCoins: 250,
		rewardShards: 3,
	},
	{
		key: 'weekly_matsuri_games',
		name: 'Play 5 Matsuri Festival Booth or Trivia Rounds',
		period: 'WEEKLY',
		target: 5,
		rewardCoins: 1_800,
		rewardShards: 20,
	},
] as const;

export interface BuildEconomyCardOptions {
	ownerId: string;
	ctx: HydratedUserContext;
	tab: EconomyHubTab;
	quests?: readonly QuestRow[];
	activeLoans?: readonly LoanRow[];
	selectedTargetId?: string | null;
	footerNotice?: string;
	createdAtMs?: number;
}

export function buildEconomyCardContainer(options: BuildEconomyCardOptions): ContainerBuilder {
	const createdAtMs = options.createdAtMs ?? Date.now();
	const { ownerId, ctx, tab } = options;
	const { user } = ctx;

	const tabs = (['wallet', 'shop', 'quests', 'transfer'] as const).map((t) => ({
		customId: encodeCustomId({
			domain: 'eco',
			action: 'tab',
			ownerId,
			state: t,
			extra: options.selectedTargetId ?? '_',
			createdAtMs,
		}),
		label: t.toUpperCase(),
		active: tab === t,
	}));

	const fields: NekoFieldOption[] = [];
	const controls: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

	if (tab === 'wallet') {
		const xpPct = Math.round(ctx.effectiveXpMultiplierBonus * 100);
		const coinPct = Math.round(ctx.effectiveCoinMultiplierBonus * 100);

		const balanceBlock = formatAlignedRows([
			{ label: 'Wallet Coins', value: `${user.coins.toLocaleString()} Coins` },
			{
				label: 'Anti-Rob Vault',
				value: `${user.vaultCoins.toLocaleString()} / ${user.vaultCapacity.toLocaleString()} Coins`,
			},
			{ label: 'Premium Gems', value: `${user.gems.toLocaleString()} Gems` },
			{ label: 'Gacha Shards', value: `${user.shards.toLocaleString()} Shards` },
			{ label: 'Star Shards', value: `${user.starShards.toLocaleString()} Star Shards` },
			{
				label: 'Boost Multipliers',
				value: `${xpPct >= 0 ? '+' : ''}${xpPct}% XP (Cap +250%) | ${coinPct >= 0 ? '+' : ''}${coinPct}% Coins (Cap +200%)`,
			},
			{ label: 'Transfer Tax', value: '5.0% Standard Guild Fee' },
		]);

		fields.push({
			key: 'FINANCIAL LEDGER & VAULT',
			value: balanceBlock,
			codeBlock: true,
		});

		const dep1k = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'eco',
					action: 'vault',
					ownerId,
					state: 'dep1k',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Deposit 1,000')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(user.coins <= 0 || user.vaultCoins >= user.vaultCapacity);

		const depMax = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'eco',
					action: 'vault',
					ownerId,
					state: 'depmax',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Deposit Max')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(user.coins <= 0 || user.vaultCoins >= user.vaultCapacity);

		const wit1k = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'eco',
					action: 'vault',
					ownerId,
					state: 'wit1k',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Withdraw 1,000')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(user.vaultCoins <= 0);

		const witAll = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'eco',
					action: 'vault',
					ownerId,
					state: 'witall',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Withdraw All')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(user.vaultCoins <= 0);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				dep1k,
				depMax,
				wit1k,
				witAll,
			),
		);
	} else if (tab === 'shop') {
		const catalogLines = SHOP_CATALOG.map((item) => {
			const cost =
				item.priceCoins > 0
					? `${item.priceCoins.toLocaleString()} Coins`
					: `${item.priceGems} Gems`;
			return `• **${item.name}** (\`${item.category}\` • **${cost}**)\n  ${item.description}`;
		}).join('\n');

		fields.push({
			key: 'NEKO MARKETPLACE CATALOG',
			value: catalogLines,
		});

		const buyMenu = new StringSelectMenuBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'eco',
					action: 'buy',
					ownerId,
					state: 'shop',
					extra: '_',
					createdAtMs,
				}),
			)
			.setPlaceholder('Select an item or permanent upgrade to purchase...')
			.addOptions(
				SHOP_CATALOG.map((item) => {
					const cost =
						item.priceCoins > 0
							? `${item.priceCoins.toLocaleString()} Coins`
							: `${item.priceGems} Gems`;
					return new StringSelectMenuOptionBuilder()
						.setValue(item.id)
						.setLabel(`${item.name} — ${cost}`)
						.setDescription(item.description.slice(0, 95));
				}),
			);

		controls.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buyMenu));
	} else if (tab === 'quests') {
		const userQuests = options.quests ?? [];
		const questLines = QUEST_DEFINITIONS.map((qDef) => {
			const row = userQuests.find((r) => r.questKey === qDef.key);
			const progress = row?.progress ?? 0;
			const claimed = row?.claimed ?? false;
			const bar = formatProgressBar(progress, qDef.target, 10);
			const status = claimed
				? formatStatus('CONFIRMED')
				: progress >= qDef.target
					? formatStatus('APPROVED')
					: `\`${progress}/${qDef.target}\``;

			return `• **[${qDef.period}] ${qDef.name}** ${status}\n  \`${bar}\` — Reward: \`+${qDef.rewardCoins} Coins\` & \`+${qDef.rewardShards} Shards\``;
		}).join('\n');

		fields.push({
			key: 'DAILY & WEEKLY SHRINE COMMISSIONS',
			value: questLines,
		});

		const claimBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'eco',
					action: 'claimquests',
					ownerId,
					state: 'quests',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Claim Completed Quests')
			.setStyle(ButtonStyle.Primary);

		controls.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(claimBtn));
	} else {
		const isLevelGated = user.level < PROGRESSION_LIMITS.MIN_TRANSFER_AND_TRADE_LEVEL;
		const targetId = options.selectedTargetId ?? null;

		if (isLevelGated) {
			fields.push({
				key: 'ANTI-ALT PROGRESSION GATE',
				value: `${formatStatus('ACCESS DENIED')} You must reach **Level ${PROGRESSION_LIMITS.MIN_TRANSFER_AND_TRADE_LEVEL}** (Currently Level ${user.level}) before using peer-to-peer Coin transfers, loans, or heist actions.`,
			});
		} else {
			const targetLine = targetId ? `<@${targetId}>` : 'None selected (Choose a member below)';

			fields.push({
				key: 'PEER-TO-PEER TRANSFERS, LOANS & HEISTS',
				value: [
					`**Selected Member:** ${targetLine}`,
					'**Give Coins:** Transfers **500 Coins** (5% guild tax -> recipient gets **475 Coins**).',
					'**Borrow Loan:** Opens a **1,000 Coin** micro-loan due in **48 hours** (Repayment: **1,050 Coins**).',
					'**Attempt Heist (Rob):** Attempts to pickpocket wallet coins (Vault coins are 100% protected!).',
				].join('\n'),
			});
		}

		const activeLoans = options.activeLoans ?? [];
		if (activeLoans.length > 0) {
			const loanLines = activeLoans
				.slice(0, 4)
				.map(
					(l) =>
						`• **Loan #${l.id}:** Repay **${l.repayCoins.toLocaleString()} Coins** — Due in ${formatCountdown(l.dueAt)}`,
				)
				.join('\n');

			fields.push({
				key: 'ACTIVE LOANS',
				value: loanLines,
			});
		}

		const userSelect = new UserSelectMenuBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'eco',
					action: 'selectuser',
					ownerId,
					state: 'transfer',
					extra: targetId ?? '_',
					createdAtMs,
				}),
			)
			.setPlaceholder('Select a member for Give, Loan, or Rob...')
			.setDisabled(isLevelGated);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(userSelect),
		);

		const giveBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'eco',
					action: 'give',
					ownerId,
					state: 'transfer',
					extra: targetId ?? '_',
					createdAtMs,
				}),
			)
			.setLabel('Give 500 Coins')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(isLevelGated || !targetId || user.coins < 500);

		const borrowBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'eco',
					action: 'borrow',
					ownerId,
					state: 'transfer',
					extra: targetId ?? '_',
					createdAtMs,
				}),
			)
			.setLabel('Borrow 1,000 (48h)')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(isLevelGated || activeLoans.length >= 2);

		const repayBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'eco',
					action: 'repay',
					ownerId,
					state: 'transfer',
					extra: String(activeLoans[0]?.id ?? 0),
					createdAtMs,
				}),
			)
			.setLabel('Repay Loan')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(activeLoans.length === 0);

		const robBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'eco',
					action: 'rob',
					ownerId,
					state: 'transfer',
					extra: targetId ?? '_',
					createdAtMs,
				}),
			)
			.setLabel('Attempt Heist')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(isLevelGated || !targetId);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				giveBtn,
				borrowBtn,
				repayBtn,
				robBtn,
			),
		);
	}

	const footer = options.footerNotice
		? statusFooter('UPDATED', options.footerNotice)
		: statusFooter(
				'CONFIRMED',
				`Wallet: ${user.coins.toLocaleString()} Coins | Vault: ${user.vaultCoins.toLocaleString()} Coins`,
			);

	return createNekoContainer({
		title: 'Neko Economy & Financial Hub',
		subtitle: `Coins: ${user.coins.toLocaleString()}  |  Gems: ${user.gems.toLocaleString()}  |  Shards: ${user.shards.toLocaleString()}`,
		tabs,
		fields,
		controls,
		footer,
	});
}

export class EconomyCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'economy',
			description:
				'Open the Neko Economy hub for Wallet, Anti-Rob Vault, Shop, Quests, Transfers, and Loans.',
			cooldownDelay: 2_000,
		});
	}

	public override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.addStringOption((opt) =>
					opt
						.setName('tab')
						.setDescription('Initial economy tab to open')
						.setRequired(false)
						.addChoices(
							{ name: 'Wallet & Vault', value: 'wallet' },
							{ name: 'Shop & Upgrades', value: 'shop' },
							{ name: 'Daily & Weekly Quests', value: 'quests' },
							{ name: 'Transfers, Loans & Heists', value: 'transfer' },
						),
				),
		);
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		const initialTab = (interaction.options.getString('tab') as EconomyHubTab | null) ?? 'wallet';
		const ctx = await this.container.context.getUserContext(interaction.user.id);

		const container = buildEconomyCardContainer({
			ownerId: interaction.user.id,
			ctx,
			tab: initialTab,
		});

		await interaction.reply({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
		});
	}
}
