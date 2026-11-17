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
import type { GachaCardRow, GachaPityRow, GachaWishlistRow } from '../../db/schema/index.ts';
import { encodeCustomId } from '../../lib/cv2/CustomId.ts';
import {
	formatAlignedRows,
	formatProgressBar,
	formatStarRating,
} from '../../lib/cv2/Formatters.ts';
import { type NekoFieldOption, createNekoContainer } from '../../lib/cv2/NekoLayout.ts';
import { formatStatus, statusFooter } from '../../lib/cv2/TimeAndStatus.ts';
import { getCuratedPokemonByRarity } from '../../services/poke.service.ts';
import type { HydratedUserContext } from '../../utilities/ContextUtility.ts';

export type GachaHubTab = 'anilist' | 'pokedex' | 'collection' | 'trade';

export interface CuratedAnimeGachaEntry {
	id: number;
	name: string;
	series: string;
	rarity: 'UR' | 'SSR' | 'SR' | 'R';
	imageUrl: string;
	altImageUrl: string;
}

export const ANILIST_GACHA_POOL: readonly CuratedAnimeGachaEntry[] = [
	{
		id: 284910,
		name: 'Momo Ayase',
		series: 'Dandadan',
		rarity: 'SSR',
		imageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b284910-momo.jpg',
		altImageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b284910-awk.jpg',
	},
	{
		id: 174651,
		name: 'Frieren',
		series: 'Sousou no Frieren',
		rarity: 'UR',
		imageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b174651-frieren.jpg',
		altImageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b174651-awk.jpg',
	},
	{
		id: 126071,
		name: 'Satoru Gojo',
		series: 'Jujutsu Kaisen',
		rarity: 'UR',
		imageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b126071-gojo.jpg',
		altImageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b126071-awk.jpg',
	},
	{
		id: 162668,
		name: 'Maomao',
		series: 'Kusuriya no Hitorigoto',
		rarity: 'SSR',
		imageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b162668-maomao.jpg',
		altImageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b162668-awk.jpg',
	},
	{
		id: 284911,
		name: 'Ken Takakura (Okarun)',
		series: 'Dandadan',
		rarity: 'SSR',
		imageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b284911-okarun.jpg',
		altImageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b284911-awk.jpg',
	},
	{
		id: 190335,
		name: 'Fern',
		series: 'Sousou no Frieren',
		rarity: 'SR',
		imageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b190335-fern.jpg',
		altImageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b190335-awk.jpg',
	},
	{
		id: 245910,
		name: 'Marcille Donato',
		series: 'Dungeon Meshi',
		rarity: 'SR',
		imageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b245910-marcille.jpg',
		altImageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b245910-awk.jpg',
	},
	{
		id: 284915,
		name: 'Turbo Granny (Beckoning Cat)',
		series: 'Dandadan',
		rarity: 'R',
		imageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b284915-turbo.jpg',
		altImageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b284915-awk.jpg',
	},
] as const;

export interface GachaPullOutcome {
	banner: 'ANILIST' | 'POKEDEX';
	externalId: number;
	name: string;
	seriesOrType: string;
	rarity: 'UR' | 'SSR' | 'SR' | 'R';
	imageUrl: string;
	altImageUrl: string;
	isWishlistedHit: boolean;
}

export function rollRarityWithPity(
	pullsSinceSsr: number,
	guaranteedSrOrHigher = false,
	randomValue: number = Math.random(),
): { rarity: 'UR' | 'SSR' | 'SR' | 'R'; resetPity: boolean } {
	const nextPullNum = pullsSinceSsr + 1;

	// Hard Pity at 80 pulls guarantees SSR or UR
	if (nextPullNum >= PROGRESSION_LIMITS.GACHA_HARD_PITY) {
		const isUr = randomValue < 0.2;
		return { rarity: isUr ? 'UR' : 'SSR', resetPity: true };
	}

	// Soft Pity starting at 65 pulls adds +6% SSR chance per pull
	const softPityBonus =
		nextPullNum >= PROGRESSION_LIMITS.GACHA_SOFT_PITY
			? (nextPullNum - PROGRESSION_LIMITS.GACHA_SOFT_PITY + 1) * 0.06
			: 0;

	const urThreshold = 0.01 + softPityBonus * 0.15;
	const ssrThreshold = urThreshold + 0.04 + softPityBonus;
	const srThreshold = ssrThreshold + 0.25;

	if (randomValue < urThreshold) {
		return { rarity: 'UR', resetPity: true };
	}
	if (randomValue < ssrThreshold) {
		return { rarity: 'SSR', resetPity: true };
	}
	if (guaranteedSrOrHigher || randomValue < srThreshold) {
		return { rarity: 'SR', resetPity: false };
	}
	return { rarity: 'R', resetPity: false };
}

export function simulateBannerPull(
	banner: 'ANILIST' | 'POKEDEX',
	pullsSinceSsr: number,
	wishlists: readonly GachaWishlistRow[],
	guaranteedSrOrHigher = false,
): { outcome: GachaPullOutcome; nextPullsSinceSsr: number } {
	const { rarity, resetPity } = rollRarityWithPity(pullsSinceSsr, guaranteedSrOrHigher);
	const nextPullsSinceSsr = resetPity ? 0 : pullsSinceSsr + 1;

	if (banner === 'ANILIST') {
		const candidates = ANILIST_GACHA_POOL.filter((c) => c.rarity === rarity);
		const pool = candidates.length > 0 ? candidates : ANILIST_GACHA_POOL;

		// Check if user has a wishlisted character in this pool (50% rate-up on tier match)
		const wishIds = new Set(wishlists.map((w) => w.externalId));
		const wishlistedMatch = pool.find((c) => wishIds.has(c.id));
		const picked =
			wishlistedMatch && Math.random() < 0.5
				? wishlistedMatch
				: pool[Math.floor(Math.random() * pool.length)]!;

		return {
			outcome: {
				banner: 'ANILIST',
				externalId: picked.id,
				name: picked.name,
				seriesOrType: picked.series,
				rarity: picked.rarity,
				imageUrl: picked.imageUrl,
				altImageUrl: picked.altImageUrl,
				isWishlistedHit: wishIds.has(picked.id),
			},
			nextPullsSinceSsr,
		};
	}

	const poke = getCuratedPokemonByRarity(rarity);
	return {
		outcome: {
			banner: 'POKEDEX',
			externalId: poke.id,
			name: poke.name,
			seriesOrType: poke.types.join(' / '),
			rarity: poke.rarity,
			imageUrl: poke.spriteUrl,
			altImageUrl: poke.shinySpriteUrl,
			isWishlistedHit: false,
		},
		nextPullsSinceSsr,
	};
}

export interface BuildGachaCardOptions {
	ownerId: string;
	ctx: HydratedUserContext;
	tab: GachaHubTab;
	pity?: GachaPityRow | null;
	wishlists?: readonly GachaWishlistRow[];
	collection?: readonly GachaCardRow[];
	lastPullResults?: readonly GachaPullOutcome[];
	selectedTradeTargetId?: string | null;
	footerNotice?: string;
	createdAtMs?: number;
}

export function buildGachaCardContainer(options: BuildGachaCardOptions): ContainerBuilder {
	const createdAtMs = options.createdAtMs ?? Date.now();
	const { ownerId, ctx, tab } = options;
	const { user } = ctx;

	const tabDefs: Array<{ key: GachaHubTab; label: string }> = [
		{ key: 'anilist', label: 'ANILIST BANNER' },
		{ key: 'pokedex', label: 'POKEDEX BANNER' },
		{ key: 'collection', label: 'COLLECTION' },
		{ key: 'trade', label: 'TRADE' },
	];

	const tabs = tabDefs.map((t) => ({
		customId: encodeCustomId({
			domain: 'gac',
			action: 'tab',
			ownerId,
			state: t.key,
			extra: options.selectedTradeTargetId ?? '_',
			createdAtMs,
		}),
		label: t.label,
		active: tab === t.key,
	}));

	const fields: NekoFieldOption[] = [];
	const controls: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
	let thumbnailUrl: string | undefined;

	if (tab === 'anilist' || tab === 'pokedex') {
		const bannerType = tab === 'anilist' ? 'ANILIST' : 'POKEDEX';
		const pullsSinceSsr = options.pity?.pullsSinceSsr ?? 0;
		const totalPulls = options.pity?.totalPulls ?? 0;
		const pityBar = formatProgressBar(pullsSinceSsr, PROGRESSION_LIMITS.GACHA_HARD_PITY, 16);

		const pityTable = formatAlignedRows([
			{
				label: 'Active Banner',
				value:
					bannerType === 'ANILIST'
						? 'AniList Legends (Popularity Rarity)'
						: 'National PokeDex (Base Stat Rarity)',
			},
			{
				label: 'SSR Pity Counter',
				value: `${pullsSinceSsr} / ${PROGRESSION_LIMITS.GACHA_HARD_PITY} ${pityBar} (Soft Pity @ 65)`,
			},
			{
				label: 'Drop Rates',
				value: 'UR: 1.0% | SSR: 4.0% | SR: 25.0% | R: 70.0%',
			},
			{
				label: 'Shard Balance',
				value: `${user.shards.toLocaleString()} Shards (${user.starShards.toLocaleString()} Star Shards) | Total Pulls: ${totalPulls}`,
			},
		]);

		fields.push({
			key: 'BANNER TELEMETRY & PITY STATUS',
			value: pityTable,
			codeBlock: true,
		});

		if (bannerType === 'ANILIST') {
			const wishes = options.wishlists ?? [];
			const wishLines =
				wishes.length > 0
					? wishes
							.map(
								(w) =>
									`• **Slot ${w.slot}/3:** ${w.name} ${formatStatus('WISHLISTED')} (+50% Banner Focus)`,
							)
							.join('\n')
					: 'No characters wishlisted yet. Use `/character <query>` or the selector below to set up to 3 rate-up targets.';

			fields.push({
				key: '3-SLOT RATE-UP WISHLIST',
				value: wishLines,
			});
		} else {
			const rayquaza = getCuratedPokemonByRarity('UR');
			const pokeStats = formatAlignedRows([
				{
					label: 'Featured UR',
					value: `${rayquaza.name} (${rayquaza.types.join('/')}) — BST ${rayquaza.bst}`,
				},
				{
					label: 'Base Stats',
					value: `HP ${rayquaza.hp} | ATK ${rayquaza.atk} | DEF ${rayquaza.def} | SPD ${rayquaza.spd}`,
				},
				{
					label: '5-Star Awakening',
					value: 'Unlocks Shiny Official Artwork & +15% Companion Boost',
				},
			]);

			fields.push({
				key: 'POKEDEX FEATURED BASE STATS',
				value: pokeStats,
				codeBlock: true,
			});
		}

		if (options.lastPullResults && options.lastPullResults.length > 0) {
			const topPull = options.lastPullResults[0]!;
			thumbnailUrl = topPull.imageUrl;
			const pullLines = options.lastPullResults
				.map((p) => {
					const wishTag = p.isWishlistedHit ? ` ${formatStatus('WISHLISTED')}` : '';
					return `• **[${p.rarity}] ${p.name}** (*${p.seriesOrType}*)${wishTag}`;
				})
				.join('\n');

			fields.push({
				key: `SUMMON RESULTS (${options.lastPullResults.length}X PULL)`,
				value: pullLines,
			});
		}

		const pull1Btn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'gac',
					action: 'pull1',
					ownerId,
					state: tab,
					extra: bannerType,
					createdAtMs,
				}),
			)
			.setLabel('Pull x1 (10 Shards)')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(user.shards < 10);

		const pull10Btn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'gac',
					action: 'pull10',
					ownerId,
					state: tab,
					extra: bannerType,
					createdAtMs,
				}),
			)
			.setLabel('Pull x10 (90 Shards • SR+)')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(user.shards < 90);

		const convertBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'gac',
					action: 'convert',
					ownerId,
					state: tab,
					extra: bannerType,
					createdAtMs,
				}),
			)
			.setLabel('Buy 10 Shards (250 Coins)')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(user.coins < 250);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				pull1Btn,
				pull10Btn,
				convertBtn,
			),
		);

		if (bannerType === 'ANILIST') {
			const wishSelect = new StringSelectMenuBuilder()
				.setCustomId(
					encodeCustomId({
						domain: 'gac',
						action: 'setwish',
						ownerId,
						state: 'anilist',
						extra: 'ANILIST',
						createdAtMs,
					}),
				)
				.setPlaceholder('Set a Featured Character on your Rate-Up Wishlist...')
				.addOptions(
					ANILIST_GACHA_POOL.map((c) =>
						new StringSelectMenuOptionBuilder()
							.setValue(String(c.id))
							.setLabel(`[${c.rarity}] ${c.name} — ${c.series}`)
							.setDescription(`Pin ${c.name} to your 3-slot rate-up wishlist`),
					),
				);

			controls.push(
				new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(wishSelect),
			);
		}
	} else if (tab === 'collection') {
		const cards = options.collection ?? [];

		if (cards.length === 0) {
			fields.push({
				key: 'CARD VAULT & ASCENSION',
				value:
					'Your collection is currently empty. Pull on the **ANILIST BANNER** or **POKEDEX BANNER** to summon characters and Pokémon!',
			});
		} else {
			const cardLines = cards.slice(0, 10).map((c) => {
				const starsStr = formatStarRating(c.stars);
				const ascBadge = c.stars >= 5 ? ` ${formatStatus('ASCENDED')}` : '';
				return `• **[${c.rarity}] ${c.name}** (\`${starsStr}\` • *${c.seriesOrType}* • Dupes: ${c.duplicates})${ascBadge}`;
			});

			fields.push({
				key: `OWNED COLLECTION (${cards.length} CARDS)`,
				value: cardLines.join('\n'),
			});

			const ascensionTable = formatAlignedRows([
				{ label: 'Star Shards', value: `${user.starShards.toLocaleString()} Star Shards` },
				{ label: 'Ascension Cost', value: '15 Star Shards per ★ Upgrade (Max ★★★★★)' },
				{
					label: '5-Star Perk',
					value: 'Unlocks Alternate Art / Shiny Sprite & +12% Companion Boost',
				},
			]);

			fields.push({
				key: '5-STAR ASCENSION MATRIX',
				value: ascensionTable,
				codeBlock: true,
			});
		}

		const ascendable = cards.filter((c) => c.stars < PROGRESSION_LIMITS.GACHA_MAX_STARS);
		if (ascendable.length > 0) {
			const ascendMenu = new StringSelectMenuBuilder()
				.setCustomId(
					encodeCustomId({
						domain: 'gac',
						action: 'ascend',
						ownerId,
						state: 'collection',
						extra: '_',
						createdAtMs,
					}),
				)
				.setPlaceholder('Select a card to Ascend (+1 ★ for 15 Star Shards)...')
				.addOptions(
					ascendable.slice(0, 12).map((c) =>
						new StringSelectMenuOptionBuilder()
							.setValue(String(c.id))
							.setLabel(
								`[${c.rarity}] ${c.name} (${formatStarRating(c.stars)} -> ${formatStarRating(c.stars + 1)})`,
							)
							.setDescription('Consumes 15 Star Shards to increase star tier'),
					),
				);

			controls.push(
				new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(ascendMenu),
			);
		}
	} else {
		const isLevelGated = user.level < PROGRESSION_LIMITS.MIN_TRANSFER_AND_TRADE_LEVEL;
		const targetId = options.selectedTradeTargetId ?? null;

		if (isLevelGated) {
			fields.push({
				key: 'P2P TRADING GATE',
				value: `${formatStatus('ACCESS DENIED')} You must reach **Level ${PROGRESSION_LIMITS.MIN_TRANSFER_AND_TRADE_LEVEL}** before trading Gacha cards or Shards with other members.`,
			});
		} else {
			fields.push({
				key: 'SAFE PEER-TO-PEER SHARD & CARD EXCHANGE',
				value: [
					`**Trading Partner:** ${targetId ? `<@${targetId}>` : 'None selected'}`,
					'• **Gift 20 Shards:** Transfers **20 Gacha Shards** to your trading partner (guarded by dual-user atomic locks).',
					'• **Convert Duplicate Shards:** Exchange **20 Shards -> 10 Star Shards** for 5-Star card ascension.',
				].join('\n'),
			});
		}

		const partnerSelect = new UserSelectMenuBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'gac',
					action: 'selectpartner',
					ownerId,
					state: 'trade',
					extra: targetId ?? '_',
					createdAtMs,
				}),
			)
			.setPlaceholder('Select a member to trade Shards with...')
			.setDisabled(isLevelGated);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(partnerSelect),
		);

		const giftShardsBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'gac',
					action: 'tradesend',
					ownerId,
					state: 'trade',
					extra: targetId ?? '_',
					createdAtMs,
				}),
			)
			.setLabel('Send 20 Shards to Partner')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(isLevelGated || !targetId || user.shards < 20);

		const refineStarBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'gac',
					action: 'refinestar',
					ownerId,
					state: 'trade',
					extra: targetId ?? '_',
					createdAtMs,
				}),
			)
			.setLabel('Refine 20 Shards -> 10 Star Shards')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(user.shards < 20);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				giftShardsBtn,
				refineStarBtn,
			),
		);
	}

	const footer = options.footerNotice
		? statusFooter('UPDATED', options.footerNotice)
		: statusFooter(
				'CONFIRMED',
				`Shards: ${user.shards.toLocaleString()} | Star Shards: ${user.starShards.toLocaleString()}`,
			);

	return createNekoContainer({
		title: 'Neko Gacha Summon & Collection Hub',
		subtitle: `Shards: ${user.shards.toLocaleString()}  |  Star Shards: ${user.starShards.toLocaleString()}  |  Hard Pity: 80 Pulls`,
		thumbnailUrl,
		tabs,
		fields,
		controls,
		footer,
	});
}

export class GachaCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'gacha',
			description:
				'Summon anime characters and Pokémon with soft/hard pity, wishlists, 5-star ascension, and trading.',
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
						.setDescription('Initial gacha tab to open')
						.setRequired(false)
						.addChoices(
							{ name: 'AniList Banner', value: 'anilist' },
							{ name: 'PokeDex Banner', value: 'pokedex' },
							{ name: 'My Collection & Ascension', value: 'collection' },
							{ name: 'Shard & Card Trading', value: 'trade' },
						),
				),
		);
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		const initialTab = (interaction.options.getString('tab') as GachaHubTab | null) ?? 'anilist';
		const ctx = await this.container.context.getUserContext(interaction.user.id);

		const container = buildGachaCardContainer({
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
