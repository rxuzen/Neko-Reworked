import { Command } from '@sapphire/framework';
import {
	ActionRowBuilder,
	type ContainerBuilder,
	type MessageActionRowComponentBuilder,
	MessageFlags,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	version as djsVersion,
} from 'discord.js';
import { BOT_NAME, BOT_VERSION } from '../../config/constants.ts';
import { encodeCustomId } from '../../lib/cv2/CustomId.ts';
import { formatAlignedRows } from '../../lib/cv2/Formatters.ts';
import { type NekoFieldOption, createNekoContainer } from '../../lib/cv2/NekoLayout.ts';
import { formatDurationCompact, statusFooter } from '../../lib/cv2/TimeAndStatus.ts';

export type NekoHubTab = 'guide' | 'about' | 'changelog';
export type NekoGuideCategory = 'media' | 'profile' | 'economy' | 'matsuri' | 'staff';

const GUIDE_CATEGORIES: Record<
	NekoGuideCategory,
	{ label: string; description: string; fields: readonly NekoFieldOption[] }
> = {
	media: {
		label: 'Anime, Manga & Media Discovery',
		description: 'Standalone commands with global autocomplete and live countdowns',
		fields: [
			{
				key: 'STANDALONE MEDIA COMMANDS',
				value: [
					'**`/anime <query>`** — Search AniList anime with `OVERVIEW`, `CHARACTERS`, `RELATIONS`, `THEMES` (OP/ED songs via AnimeThemes.moe), and `STATS` tabs.',
					'**`/manga <query>`** — Inspect manga & light novels (`OVERVIEW`, `CHARACTERS`, `ADAPTATIONS`).',
					'**`/character <query>`** — View characters, JP/EN Seiyuu (voice actors), spoiler-safe biographies, and live `/gacha` collection status.',
					'**`/schedule [day]`** — Timezone-aware airing schedule (`TODAY`, `UPCOMING`, `MY WATCHLIST`).',
					'**`/sauce [image] [url]`** — Reverse image search via SauceNAO & Trace.moe.',
					'**`/social <action> [user]`** — Send anime reaction GIFs with instant re-rolls.',
				].join('\n'),
			},
		],
	},
	profile: {
		label: 'Profile, Neko Companion & Settings',
		description: 'Levels, Careers, Neko Familiar bonds, and user customization',
		fields: [
			{
				key: 'PROFILE & COMPANION HUBS',
				value: [
					'**`/profile [user]`** — Inspect `OVERVIEW`, `COMPANION`, `CAREER`, and `CUSTOMIZE` tabs.',
					'**Neko Companion (`COMPANION` tab)** — Equip your Neko familiar or a pulled `/gacha` card. Headpat, feed Matsuri snacks, and send them on idle **Neko Expeditions** for passive XP/Coin multipliers and Shards.',
					'**`/settings`** — Configure Romaji/English title mode, personal timezone, DM notifications, and wallet privacy.',
				].join('\n'),
			},
		],
	},
	economy: {
		label: 'Economy, Vault & Gacha Summons',
		description: 'Coins, Gems, Shards, 5-Star Ascension, Wishlists & P2P Trading',
		fields: [
			{
				key: 'ECONOMY & GACHA HUBS',
				value: [
					'**`/economy`** — Manage `WALLET` & anti-rob Vault, browse `SHOP` boosts/snacks, track `QUESTS`, and execute `TRANSFER` (Give, Borrow with deadlines, Rob).',
					'**`/gacha`** — Summon across `ANILIST BANNER` and `POKEDEX BANNER` with soft/hard pity (65/80), 3-slot **Wishlist** rate-ups, **5-Star Ascension (`★☆☆☆☆` to `★★★★★`)**, and safe P2P `TRADE`.',
				].join('\n'),
			},
		],
	},
	matsuri: {
		label: 'Matsuri Festival, Shrine & Trivia',
		description: 'Daily Ema check-ins, Omikuji fortunes, festival booths & anime trivia',
		fields: [
			{
				key: 'UNIFIED MATSURI HUB',
				value: [
					'**`/matsuri` (`SHRINE` tab)** — Claim daily Ema check-in streaks and draw **Omikuji** fortunes (`DAI-KICHI` `[ BLESSED ]` down to `KYOU` `[ CURSED ]` with pine-tree curse cleansing).',
					'**`/matsuri` (`BOOTHS` tab)** — Play Goldfish Scooping, Lantern Toss, and Taiko Rhythm for Coins and Companion snacks.',
					'**`/matsuri` (`TRIVIA` tab)** — Compete in timed anime quote, character, and studio trivia rounds.',
				].join('\n'),
			},
		],
	},
	staff: {
		label: 'Staff Control Panel & Airing Feeds',
		description: 'Moderation, server airing notification channels, and runtime diagnostics',
		fields: [
			{
				key: 'STAFF & ADMINISTRATION',
				value: [
					'**`/staff` (`MOD` | `ADMIN` | `OWNER`)** — Role-gated control panel for case logs, server economy overrides, **Anime Airing Notification Channel** binding, and circuit breaker diagnostics.',
				].join('\n'),
			},
		],
	},
};

export interface BuildNekoHubOptions {
	ownerId: string;
	tab: NekoHubTab;
	guideCategory?: NekoGuideCategory;
	wsPing: number;
	guildCount: number;
	commandCount: number;
	handlerCount: number;
	createdAtMs?: number;
}

export function buildNekoHubContainer(options: BuildNekoHubOptions): ContainerBuilder {
	const createdAtMs = options.createdAtMs ?? Date.now();
	const category: NekoGuideCategory = options.guideCategory ?? 'media';

	const tabs = (['guide', 'about', 'changelog'] as const).map((t) => ({
		customId: encodeCustomId({
			domain: 'neko',
			action: 'tab',
			ownerId: options.ownerId,
			state: t,
			extra: category,
			createdAtMs,
		}),
		label: t.toUpperCase(),
		active: options.tab === t,
	}));

	if (options.tab === 'guide') {
		const selectedGuide = GUIDE_CATEGORIES[category];
		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'neko',
					action: 'guide',
					ownerId: options.ownerId,
					state: 'guide',
					extra: category,
					createdAtMs,
				}),
			)
			.setPlaceholder('Select a Neko guide category...')
			.addOptions(
				(Object.keys(GUIDE_CATEGORIES) as NekoGuideCategory[]).map((key) =>
					new StringSelectMenuOptionBuilder()
						.setValue(key)
						.setLabel(GUIDE_CATEGORIES[key].label)
						.setDescription(GUIDE_CATEGORIES[key].description)
						.setDefault(key === category),
				),
			);

		const selectRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
			selectMenu,
		);

		return createNekoContainer({
			title: `${BOT_NAME} — Interactive Command Guide`,
			subtitle: `Category: ${selectedGuide.label}  |  v${BOT_VERSION}`,
			tabs,
			fields: selectedGuide.fields,
			controls: [selectRow],
			footer: statusFooter('UPDATED', `Viewing ${selectedGuide.label}`),
		});
	}

	if (options.tab === 'about') {
		const memMb = (process.memoryUsage().rss / 1_024 / 1_024).toFixed(1);
		const uptimeStr = formatDurationCompact(Math.floor(process.uptime() * 1_000));
		const runtimeTable = formatAlignedRows([
			{ label: 'Bot Version', value: `v${BOT_VERSION}` },
			{ label: 'Runtime Engine', value: `Bun v${Bun.version} (TypeScript 7 tsgo)` },
			{ label: 'Discord Library', value: `discord.js v${djsVersion} (Components V2)` },
			{ label: 'Gateway Latency', value: `${Math.max(0, options.wsPing)} ms` },
			{ label: 'Memory (RSS)', value: `${memMb} MB` },
			{ label: 'Process Uptime', value: uptimeStr },
			{
				label: 'Loaded Pieces',
				value: `${options.commandCount} Commands / ${options.handlerCount} Handlers`,
			},
			{ label: 'Active Guilds', value: options.guildCount },
		]);

		return createNekoContainer({
			title: `${BOT_NAME} — System & Architecture Overview`,
			subtitle: `Minimalist Anime Discord Bot  |  v${BOT_VERSION}`,
			tabs,
			fields: [
				{
					key: 'RUNTIME TELEMETRY',
					value: runtimeTable,
					codeBlock: true,
				},
				{
					key: 'DESIGN PHILOSOPHY',
					value:
						'Built exclusively on **Discord Components V2** (`MessageFlags.IsComponentsV2`) with colorless high-contrast cards, two-tier L1/L2 caching, Redis circuit breakers, and atomic Drizzle PostgreSQL transactions.',
				},
			],
			footer: statusFooter('CONFIRMED', `${BOT_NAME} runtime healthy`),
		});
	}

	return createNekoContainer({
		title: `${BOT_NAME} — Release Changelog`,
		subtitle: `Latest Release: v${BOT_VERSION}`,
		tabs,
		fields: [
			{
				key: `VERSION ${BOT_VERSION} — INITIAL ARCHITECTURE`,
				value: [
					'• **Components V2 UI Kit**: Colorless cards, top navigation tabs, `sanitizeAnimeText` spoiler/HTML hygiene, and 14-minute stateless `customId` expiry protection.',
					'• **Anime & Media Suite**: `/anime` (with OP/ED `THEMES` via AnimeThemes.moe), `/manga`, `/character` (Seiyuu + live gacha badges), `/schedule`, `/sauce`, and `/social`.',
					'• **Neko Companion & Gacha**: Companion bond levels & idle expeditions, soft/hard gacha pity, 3-slot wishlists, 5-Star ascension (`★★★★★`), and dual-locked P2P trading.',
					'• **Unified Matsuri Hub**: Merged `SHRINE` (Ema check-in + Omikuji fortunes), `BOOTHS`, `TRIVIA`, and `LEADERBOARD` tabs.',
				].join('\n'),
			},
		],
		footer: statusFooter('UPDATED', `Changelog synced for v${BOT_VERSION}`),
	});
}

export class NekoCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'neko',
			description: 'Open the Neko interactive guide, runtime telemetry, and changelog hub.',
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
						.setDescription('Initial tab to open')
						.setRequired(false)
						.addChoices(
							{ name: 'Guide', value: 'guide' },
							{ name: 'About & Telemetry', value: 'about' },
							{ name: 'Changelog', value: 'changelog' },
						),
				),
		);
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		const initialTab = (interaction.options.getString('tab') as NekoHubTab | null) ?? 'guide';

		const container = buildNekoHubContainer({
			ownerId: interaction.user.id,
			tab: initialTab,
			guideCategory: 'media',
			wsPing: interaction.client.ws.ping,
			guildCount: interaction.client.guilds.cache.size,
			commandCount: this.container.stores.get('commands').size,
			handlerCount: this.container.stores.get('interaction-handlers').size,
		});

		await interaction.reply({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
		});
	}
}
