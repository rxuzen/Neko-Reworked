import { Command } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ContainerBuilder,
	type MessageActionRowComponentBuilder,
	MessageFlags,
} from 'discord.js';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { gachaCards, gachaWishlists } from '../../db/schema/index.ts';
import { encodeCustomId } from '../../lib/cv2/CustomId.ts';
import { formatStarRating, sanitizeAnimeText } from '../../lib/cv2/Formatters.ts';
import { type NekoFieldOption, createNekoContainer } from '../../lib/cv2/NekoLayout.ts';
import { formatStatus, statusFooter } from '../../lib/cv2/TimeAndStatus.ts';
import { getCharacterByIdOrSearch } from '../../services/anilist.service.ts';
import type { CharacterDetail } from '../../services/jikan.service.ts';

export type CharacterCardTab = 'overview' | 'voice_actors' | 'appearances';

export interface CharacterGachaStatus {
	owned: boolean;
	rarity: string;
	stars: number;
	wishlistedSlot: number | null;
}

export function deriveCharacterRarity(favourites: number): 'UR' | 'SSR' | 'SR' | 'R' {
	if (favourites >= 25_000) return 'UR';
	if (favourites >= 8_000) return 'SSR';
	if (favourites >= 1_500) return 'SR';
	return 'R';
}

export async function lookupCharacterGachaStatus(
	userId: string,
	characterId: number,
	favourites: number,
): Promise<CharacterGachaStatus> {
	const fallbackRarity = deriveCharacterRarity(favourites);
	try {
		const [cardRows, wishRows] = await Promise.all([
			db
				.select()
				.from(gachaCards)
				.where(
					and(
						eq(gachaCards.userId, userId),
						eq(gachaCards.banner, 'ANILIST'),
						eq(gachaCards.externalId, characterId),
					),
				)
				.limit(1),
			db
				.select()
				.from(gachaWishlists)
				.where(
					and(
						eq(gachaWishlists.userId, userId),
						eq(gachaWishlists.banner, 'ANILIST'),
						eq(gachaWishlists.externalId, characterId),
					),
				)
				.limit(1),
		]);

		const card = cardRows[0];
		const wish = wishRows[0];

		return {
			owned: Boolean(card),
			rarity: card?.rarity ?? fallbackRarity,
			stars: card?.stars ?? 0,
			wishlistedSlot: wish?.slot ?? null,
		};
	} catch {
		return {
			owned: false,
			rarity: fallbackRarity,
			stars: 0,
			wishlistedSlot: null,
		};
	}
}

export interface BuildCharacterCardOptions {
	ownerId: string;
	character: CharacterDetail;
	tab: CharacterCardTab;
	gachaStatus: CharacterGachaStatus;
	createdAtMs?: number;
}

export function buildCharacterCardContainer(options: BuildCharacterCardOptions): ContainerBuilder {
	const createdAtMs = options.createdAtMs ?? Date.now();
	const { character, tab, ownerId, gachaStatus } = options;

	const ownershipBadge = gachaStatus.owned
		? `[ OWNED ${formatStarRating(gachaStatus.stars)} ]`
		: formatStatus('UNOWNED');
	const subtitle = `${character.primaryMediaTitle}  |  ${character.favourites.toLocaleString()} Favorites  |  ${ownershipBadge}`;

	const tabKeys: readonly CharacterCardTab[] = ['overview', 'voice_actors', 'appearances'];
	const tabLabels: Record<CharacterCardTab, string> = {
		overview: 'OVERVIEW',
		voice_actors: 'VOICE ACTORS',
		appearances: 'APPEARANCES',
	};

	const tabs = tabKeys.map((t) => ({
		customId: encodeCustomId({
			domain: 'chr',
			action: 'tab',
			ownerId,
			state: t,
			extra: String(character.id),
			createdAtMs,
		}),
		label: tabLabels[t],
		active: tab === t,
	}));

	const fields: NekoFieldOption[] = [];

	if (tab === 'overview') {
		const jpVa = character.voiceActors.find((v) => v.language.toUpperCase() === 'JAPANESE');
		const enVa = character.voiceActors.find((v) => v.language.toUpperCase() === 'ENGLISH');

		fields.push({
			key: 'VOICE ACTORS (SEIYUU)',
			value: [
				`**Japanese:** ${jpVa ? `[${jpVa.name}](${jpVa.siteUrl})` : 'Unlisted'}`,
				`**English:** ${enVa ? `[${enVa.name}](${enVa.siteUrl})` : 'Unlisted'}`,
			].join('\n'),
		});

		const wishStatus = gachaStatus.wishlistedSlot
			? `${formatStatus('WISHLISTED')} (Slot ${gachaStatus.wishlistedSlot}/3)`
			: 'Not on Wishlist';
		const ascensionStr = gachaStatus.owned
			? `${formatStarRating(gachaStatus.stars)} (+${gachaStatus.stars * 3}% Companion XP)`
			: 'Unowned in `/gacha`';

		fields.push({
			key: 'GACHA COLLECTION STATUS',
			value: [
				`**Pool Rarity:** ${gachaStatus.rarity} (AniList Banner)  |  **Ascension:** ${ascensionStr}`,
				`**Wishlist Status:** ${wishStatus}`,
			].join('\n'),
		});

		fields.push({
			key: 'BIOGRAPHY',
			value: sanitizeAnimeText(character.description, 750),
		});
	} else if (tab === 'voice_actors') {
		const vaLines =
			character.voiceActors.length > 0
				? character.voiceActors
						.map((va) => `• **${va.language}:** [${va.name}](${va.siteUrl})`)
						.join('\n')
				: 'No voice actor credits listed for this character.';

		fields.push({
			key: 'SEIYUU & VOICE CAST CREDITS',
			value: vaLines,
		});
	} else {
		const appLines =
			character.appearances.length > 0
				? character.appearances
						.map(
							(a) => `• **[${a.title}](${a.siteUrl})** — \`${a.role}\` (${a.type} • ${a.format})`,
						)
						.join('\n')
				: 'No anime or manga appearances recorded.';

		fields.push({
			key: 'ANIME & MANGA APPEARANCES',
			value: appLines,
		});
	}

	const wishlistBtn = new ButtonBuilder()
		.setCustomId(
			encodeCustomId({
				domain: 'chr',
				action: 'wish',
				ownerId,
				state: gachaStatus.wishlistedSlot ? 'remove' : 'add',
				extra: String(character.id),
				createdAtMs,
			}),
		)
		.setLabel(gachaStatus.wishlistedSlot ? '★ Wishlisted' : '+ Add to Wishlist')
		.setStyle(gachaStatus.wishlistedSlot ? ButtonStyle.Primary : ButtonStyle.Secondary);

	const equipBtn = new ButtonBuilder()
		.setCustomId(
			encodeCustomId({
				domain: 'chr',
				action: 'equip',
				ownerId,
				state: 'partner',
				extra: String(character.id),
				createdAtMs,
			}),
		)
		.setLabel('Equip as Companion')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(!gachaStatus.owned);

	const linkBtn = new ButtonBuilder()
		.setLabel('AniList Page ↗')
		.setStyle(ButtonStyle.Link)
		.setURL(character.siteUrl);

	const controlRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
		wishlistBtn,
		equipBtn,
		linkBtn,
	);

	return createNekoContainer({
		title: character.nameFull,
		subtitle,
		thumbnailUrl: character.imageUrl ?? undefined,
		tabs,
		fields,
		controls: [controlRow],
		footer: `Character ID: ${character.id}  |  Spoilers Masked  |  ${statusFooter('UPDATED', 'Synced')}`,
	});
}

export class CharacterCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'character',
			description:
				'Inspect anime/manga characters, Seiyuu voice actors, biographies, and gacha status.',
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
						.setName('query')
						.setDescription('Character name or AniList ID')
						.setRequired(true)
						.setAutocomplete(true),
				),
		);
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		const query = interaction.options.getString('query', true);
		const character = await getCharacterByIdOrSearch(query);

		if (!character) {
			await this.container.cv2.notify(interaction, {
				status: 'ERROR',
				title: 'Character Not Found',
				message: `No anime or manga character matching \`${query}\` could be found.`,
				ephemeral: true,
			});
			return;
		}

		const gachaStatus = await lookupCharacterGachaStatus(
			interaction.user.id,
			character.id,
			character.favourites,
		);

		const container = buildCharacterCardContainer({
			ownerId: interaction.user.id,
			character,
			tab: 'overview',
			gachaStatus,
		});

		await interaction.reply({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
		});
	}
}
