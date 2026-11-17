import { Command } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ContainerBuilder,
	type MessageActionRowComponentBuilder,
	MessageFlags,
} from 'discord.js';
import type { UserRow } from '../../db/schema/index.ts';
import { OMIKUJI_FORTUNES, type OmikujiFortuneDefinition } from '../../db/seed.ts';
import { encodeCustomId } from '../../lib/cv2/CustomId.ts';
import { formatAlignedRows } from '../../lib/cv2/Formatters.ts';
import { type NekoFieldOption, createNekoContainer } from '../../lib/cv2/NekoLayout.ts';
import { discordTime, formatStatus, statusFooter } from '../../lib/cv2/TimeAndStatus.ts';
import type { HydratedUserContext } from '../../utilities/ContextUtility.ts';

export type MatsuriHubTab = 'shrine' | 'booths' | 'trivia' | 'leaderboard';

export interface AnimeTriviaQuestion {
	id: string;
	question: string;
	options: readonly [string, string, string, string];
	correctIndex: number;
	series: string;
}

export const ANIME_TRIVIA_BANK: readonly AnimeTriviaQuestion[] = [
	{
		id: 'q_dandadan_studio',
		question: 'Which animation studio produced the 2024/2026 TV anime adaptation of Dandadan?',
		options: ['Science SARU', 'MAPPA', 'Bones', 'Trigger'],
		correctIndex: 0,
		series: 'Dandadan',
	},
	{
		id: 'q_frieren_party',
		question: 'Who was the Hero in Frieren’s original party that defeated the Demon King?',
		options: ['Himmel', 'Heiter', 'Eisen', 'Stark'],
		correctIndex: 0,
		series: 'Sousou no Frieren',
	},
	{
		id: 'q_apothecary_protag',
		question:
			'What is the name of the apothecary protagonist in The Apothecary Diaries (Kusuriya no Hitorigoto)?',
		options: ['Maomao', 'Gyokuyou', 'Loulan', 'Xiaomao'],
		correctIndex: 0,
		series: 'Kusuriya no Hitorigoto',
	},
	{
		id: 'q_jjk_domain',
		question: 'What is the name of Satoru Gojo’s Domain Expansion in Jujutsu Kaisen?',
		options: [
			'Unlimited Void',
			'Malevolent Shrine',
			'Chimera Shadow Garden',
			'Self-Embodiment of Perfection',
		],
		correctIndex: 0,
		series: 'Jujutsu Kaisen',
	},
] as const;

export function drawWeightedOmikuji(randomValue: number = Math.random()): OmikujiFortuneDefinition {
	const totalWeight = OMIKUJI_FORTUNES.reduce((acc, f) => acc + f.weight, 0);
	let roll = randomValue * totalWeight;
	for (const fortune of OMIKUJI_FORTUNES) {
		if (roll < fortune.weight) {
			return fortune;
		}
		roll -= fortune.weight;
	}
	return OMIKUJI_FORTUNES[0]!;
}

export interface BuildMatsuriCardOptions {
	ownerId: string;
	ctx: HydratedUserContext;
	tab: MatsuriHubTab;
	boothResultText?: string;
	triviaQuestion?: AnimeTriviaQuestion;
	triviaResultText?: string;
	leaderboardRows?: readonly UserRow[];
	footerNotice?: string;
	nowMs?: number;
	createdAtMs?: number;
}

export function buildMatsuriCardContainer(options: BuildMatsuriCardOptions): ContainerBuilder {
	const createdAtMs = options.createdAtMs ?? Date.now();
	const nowMs = options.nowMs ?? Date.now();
	const { ownerId, ctx, tab } = options;
	const { user } = ctx;

	const tabs = (['shrine', 'booths', 'trivia', 'leaderboard'] as const).map((t) => ({
		customId: encodeCustomId({
			domain: 'mat',
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

	if (tab === 'shrine') {
		const activeFortune =
			user.omikujiFortune && user.omikujiExpiresAt && user.omikujiExpiresAt.getTime() > nowMs
				? OMIKUJI_FORTUNES.find((f) => f.id === user.omikujiFortune)
				: null;

		const isCursed = activeFortune?.id === 'KYOU';
		const fortuneDisplay = activeFortune
			? `**${activeFortune.name}** ${formatStatus(activeFortune.statusTag)} (Expires ${discordTime(user.omikujiExpiresAt!, 'R')})\n${activeFortune.description}`
			: 'No active fortune slip today. Draw an **Omikuji** below to receive a 24-hour blessing!';

		fields.push({
			key: 'NEKO SHRINE & EMA CHECK-IN RITUAL',
			value: [
				`**Daily Shrine Streak:** **${user.shrineStreak} Days**`,
				`**Check-In Blessing:** Grants \`${200 + user.shrineStreak * 35} Coins\` & \`${5 + Math.min(10, user.shrineStreak)} Shards\``,
			].join('\n'),
		});

		fields.push({
			key: 'OMIKUJI SACRED FORTUNE',
			value: fortuneDisplay,
		});

		const prayBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'mat',
					action: 'pray',
					ownerId,
					state: 'shrine',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Pray & Hang Ema (Daily)')
			.setStyle(ButtonStyle.Primary);

		const omikujiBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'mat',
					action: 'omikuji',
					ownerId,
					state: 'shrine',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Draw Omikuji (100 Coins)')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(user.coins < 100);

		const cleanseBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'mat',
					action: 'cleanse',
					ownerId,
					state: 'shrine',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Tie to Pine Tree (150 Coins)')
			.setStyle(isCursed ? ButtonStyle.Primary : ButtonStyle.Secondary)
			.setDisabled(!isCursed || user.coins < 150);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				prayBtn,
				omikujiBtn,
				cleanseBtn,
			),
		);
	} else if (tab === 'booths') {
		fields.push({
			key: 'MATSURI FESTIVAL BOOTHS (ENTRY: 100 COINS)',
			value: [
				'• **Goldfish Scooping (`Kingyo Sukui`):** Scoop prized festival koi with a delicate paper *poi* for up to **450 Coins** & **Matsuri Points**.',
				'• **Lantern Toss (`Chochin Toss`):** Toss glowing paper lanterns through floating torii rings for **Shards** and **Coins**.',
				'• **Taiko Rhythm (`Taiko Drum`):** Strike `DON` and `KA` beats in sync with the festival drums!',
			].join('\n'),
		});

		if (options.boothResultText) {
			fields.push({
				key: 'LATEST BOOTH OUTCOME',
				value: options.boothResultText,
			});
		}

		const goldfishBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'mat',
					action: 'booth',
					ownerId,
					state: 'goldfish',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Scoop Goldfish (100 Coins)')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(user.coins < 100);

		const lanternBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'mat',
					action: 'booth',
					ownerId,
					state: 'lantern',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Lantern Toss (100 Coins)')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(user.coins < 100);

		const taikoBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'mat',
					action: 'booth',
					ownerId,
					state: 'taiko',
					extra: '_',
					createdAtMs,
				}),
			)
			.setLabel('Taiko Drum (100 Coins)')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(user.coins < 100);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				goldfishBtn,
				lanternBtn,
				taikoBtn,
			),
		);
	} else if (tab === 'trivia') {
		const q = options.triviaQuestion ?? ANIME_TRIVIA_BANK[0]!;

		fields.push({
			key: `ANIME TRIVIA CHALLENGE (${q.series.toUpperCase()})`,
			value: `**Q:** ${q.question}\n*Correct answers award **+220 Coins**, **+3 Shards**, and **+25 Matsuri Points**!*`,
		});

		if (options.triviaResultText) {
			fields.push({
				key: 'ROUND VERDICT',
				value: options.triviaResultText,
			});
		}

		const optionButtons = q.options.map((label, idx) =>
			new ButtonBuilder()
				.setCustomId(
					encodeCustomId({
						domain: 'mat',
						action: 'ans',
						ownerId,
						state: String(idx),
						extra: q.id,
						createdAtMs,
					}),
				)
				.setLabel(label)
				.setStyle(ButtonStyle.Secondary),
		);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(optionButtons),
		);
	} else {
		const topUsers = options.leaderboardRows ?? [user];
		const lbRows = topUsers.slice(0, 10).map((u, idx) => ({
			label: `#${idx + 1} (${u.id.slice(-4)})`,
			value: `${u.matsuriPoints.toLocaleString()} Pts | Streak: ${u.shrineStreak}d | Lv. ${u.level}`,
		}));

		fields.push({
			key: 'MATSURI FESTIVAL STANDINGS',
			value: formatAlignedRows(lbRows),
			codeBlock: true,
		});
	}

	const footer = options.footerNotice
		? statusFooter('UPDATED', options.footerNotice)
		: statusFooter(
				'CONFIRMED',
				`Matsuri Points: ${user.matsuriPoints.toLocaleString()} | Streak: ${user.shrineStreak}d`,
			);

	return createNekoContainer({
		title: 'Neko Matsuri Festival & Shrine Hub',
		subtitle: `Matsuri Points: ${user.matsuriPoints.toLocaleString()}  |  Shrine Streak: ${user.shrineStreak} Days  |  Coins: ${user.coins.toLocaleString()}`,
		tabs,
		fields,
		controls,
		footer,
	});
}

export class MatsuriCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'matsuri',
			description:
				'Visit the Neko Shrine (Ema check-in & Omikuji), play Matsuri festival booths, and anime trivia.',
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
						.setDescription('Initial Matsuri festival tab to open')
						.setRequired(false)
						.addChoices(
							{ name: 'Shrine & Omikuji Fortune', value: 'shrine' },
							{ name: 'Festival Minigame Booths', value: 'booths' },
							{ name: 'Anime Trivia Challenge', value: 'trivia' },
							{ name: 'Festival Leaderboard', value: 'leaderboard' },
						),
				),
		);
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		const initialTab = (interaction.options.getString('tab') as MatsuriHubTab | null) ?? 'shrine';
		const ctx = await this.container.context.getUserContext(interaction.user.id);

		const container = buildMatsuriCardContainer({
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
