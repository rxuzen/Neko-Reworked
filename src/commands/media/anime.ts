import { Command } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ContainerBuilder,
	type MessageActionRowComponentBuilder,
	MessageFlags,
} from 'discord.js';
import { encodeCustomId } from '../../lib/cv2/CustomId.ts';
import { formatAlignedRows, sanitizeAnimeText } from '../../lib/cv2/Formatters.ts';
import { type NekoFieldOption, createNekoContainer } from '../../lib/cv2/NekoLayout.ts';
import {
	discordTime,
	formatCountdown,
	formatStatus,
	statusFooter,
} from '../../lib/cv2/TimeAndStatus.ts';
import { getAnimeByIdOrSearch } from '../../services/anilist.service.ts';
import {
	type AnimeThemeEntry,
	getAnimeThemesByAnilistId,
} from '../../services/animethemes.service.ts';
import type { AnimeMediaDetail } from '../../services/jikan.service.ts';

export type AnimeCardTab = 'overview' | 'characters' | 'relations' | 'themes' | 'stats';

export interface BuildAnimeCardOptions {
	ownerId: string;
	anime: AnimeMediaDetail;
	tab: AnimeCardTab;
	titleMode: string;
	inWatchlist?: boolean;
	notifyOnAir?: boolean;
	themes?: readonly AnimeThemeEntry[];
	createdAtMs?: number;
}

export function resolvePreferredTitle(
	romaji: string,
	english: string | null,
	titleMode: string,
): string {
	if (titleMode.toUpperCase() === 'ENGLISH' && english) {
		return english;
	}
	return romaji;
}

export function buildAnimeCardContainer(options: BuildAnimeCardOptions): ContainerBuilder {
	const createdAtMs = options.createdAtMs ?? Date.now();
	const { anime, tab, ownerId, titleMode } = options;
	const displayTitle = resolvePreferredTitle(anime.titleRomaji, anime.titleEnglish, titleMode);
	const epText = anime.episodes ? `${anime.episodes} Episodes` : 'Ongoing';
	const subtitle = `${formatStatus(anime.status)}  |  ${anime.format}  |  ${epText}  |  ${anime.studio}`;

	const tabKeys: readonly AnimeCardTab[] = [
		'overview',
		'characters',
		'relations',
		'themes',
		'stats',
	];
	const tabs = tabKeys.map((t) => ({
		customId: encodeCustomId({
			domain: 'ani',
			action: 'tab',
			ownerId,
			state: t,
			extra: String(anime.id),
			createdAtMs,
		}),
		label: t.toUpperCase(),
		active: tab === t,
	}));

	const fields: NekoFieldOption[] = [];

	if (tab === 'overview') {
		if (anime.nextAiringEpisode) {
			const { episode, airingAtUnix } = anime.nextAiringEpisode;
			fields.push({
				key: 'NEXT EPISODE',
				value: `**Episode ${episode}** airs in ${formatCountdown(airingAtUnix)}\nExact Air Time: ${discordTime(airingAtUnix, 'f')}`,
			});
		}

		const scoreStr = anime.averageScore ? `${anime.averageScore} / 10` : 'Unrated';
		const seasonStr =
			anime.season && anime.seasonYear
				? `${anime.season} ${anime.seasonYear}`
				: anime.seasonYear
					? String(anime.seasonYear)
					: 'TBA';

		fields.push({
			key: 'DETAILS',
			value: [
				`**Season:** ${seasonStr}  |  **Source:** ${anime.source}`,
				`**Score:** ${scoreStr}  |  **Popularity:** ${anime.popularity.toLocaleString()}  |  **Favorites:** ${anime.favourites.toLocaleString()}`,
			].join('\n'),
		});

		const genresText = anime.genres.length > 0 ? anime.genres.join(', ') : 'Uncategorized';
		const tagsText = anime.tags.length > 0 ? `  |  ${anime.tags.join(', ')}` : '';
		fields.push({
			key: 'GENRES & THEMES',
			value: `${genresText}${tagsText}`,
		});

		fields.push({
			key: 'SYNOPSIS',
			value: sanitizeAnimeText(anime.description, 750),
		});
	} else if (tab === 'characters') {
		const charLines =
			anime.characters.length > 0
				? anime.characters
						.map((c) => {
							const va = c.voiceActorJp ? ` — CV: *${c.voiceActorJp}*` : '';
							return `• **${c.name}** (\`${c.role}\`)${va}`;
						})
						.join('\n')
				: 'No character records indexed for this entry.';

		fields.push({
			key: 'CAST & SEIYUU (JAPANESE)',
			value: charLines,
		});
	} else if (tab === 'relations') {
		const relLines =
			anime.relations.length > 0
				? anime.relations
						.map(
							(r) =>
								`• **[${r.title}](${r.siteUrl})** — \`${r.relationType}\` (${r.format} • ${formatStatus(r.status)})`,
						)
						.join('\n')
				: 'No linked sequels, prequels, or source adaptations found.';

		fields.push({
			key: 'FRANCHISE RELATIONS',
			value: relLines,
		});
	} else if (tab === 'themes') {
		const themes = options.themes ?? [];
		const opLines = themes
			.filter((t) => t.type === 'OP')
			.map((t) => {
				const artistStr = t.artists.length > 0 ? ` by **${t.artists.join(', ')}**` : '';
				const epRange = t.episodes ? ` (Ep ${t.episodes})` : '';
				const link = t.videoUrl ? ` — [Watch WebM ↗](${t.videoUrl})` : '';
				return `• **${t.slug}:** "${t.songTitle}"${artistStr}${epRange}${link}`;
			});

		const edLines = themes
			.filter((t) => t.type === 'ED')
			.map((t) => {
				const artistStr = t.artists.length > 0 ? ` by **${t.artists.join(', ')}**` : '';
				const epRange = t.episodes ? ` (Ep ${t.episodes})` : '';
				const link = t.videoUrl ? ` — [Watch WebM ↗](${t.videoUrl})` : '';
				return `• **${t.slug}:** "${t.songTitle}"${artistStr}${epRange}${link}`;
			});

		fields.push({
			key: 'OPENING THEMES (OP)',
			value:
				opLines.length > 0 ? opLines.join('\n') : 'No opening themes indexed on AnimeThemes.moe.',
		});
		fields.push({
			key: 'ENDING THEMES (ED)',
			value:
				edLines.length > 0 ? edLines.join('\n') : 'No ending themes indexed on AnimeThemes.moe.',
		});
	} else {
		const statsBlock = formatAlignedRows([
			{ label: 'Average Score', value: anime.averageScore ? `${anime.averageScore} / 10` : 'N/A' },
			{ label: 'Members / Pop', value: anime.popularity.toLocaleString() },
			{ label: 'Favorites', value: anime.favourites.toLocaleString() },
			{ label: 'Episodes', value: anime.episodes ?? 'Unknown' },
			{
				label: 'Episode Length',
				value: anime.durationMinutes ? `${anime.durationMinutes} mins` : 'Unknown',
			},
			{ label: 'Primary Studio', value: anime.studio },
		]);

		fields.push({
			key: 'COMMUNITY & BROADCAST METRICS',
			value: statsBlock,
			codeBlock: true,
		});
	}

	const watchlistBtn = new ButtonBuilder()
		.setCustomId(
			encodeCustomId({
				domain: 'ani',
				action: 'watch',
				ownerId,
				state: options.inWatchlist ? 'remove' : 'add',
				extra: String(anime.id),
				createdAtMs,
			}),
		)
		.setLabel(options.inWatchlist ? '✓ In Watchlist' : '+ Add to Watchlist')
		.setStyle(options.inWatchlist ? ButtonStyle.Primary : ButtonStyle.Secondary);

	const notifyBtn = new ButtonBuilder()
		.setCustomId(
			encodeCustomId({
				domain: 'ani',
				action: 'notify',
				ownerId,
				state: options.notifyOnAir ? 'off' : 'on',
				extra: String(anime.id),
				createdAtMs,
			}),
		)
		.setLabel(options.notifyOnAir ? 'Air Alerts: ON' : 'Notify Me on Air')
		.setStyle(options.notifyOnAir ? ButtonStyle.Primary : ButtonStyle.Secondary);

	const linkBtn = new ButtonBuilder()
		.setLabel('AniList Page ↗')
		.setStyle(ButtonStyle.Link)
		.setURL(anime.siteUrl);

	const controlRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
		watchlistBtn,
		notifyBtn,
		linkBtn,
	);

	return createNekoContainer({
		title: displayTitle,
		subtitle,
		thumbnailUrl: anime.coverImageUrl ?? undefined,
		tabs,
		fields,
		controls: [controlRow],
		footer: `AniList ID: ${anime.id}  |  Title Mode: ${titleMode}  |  ${statusFooter('UPDATED', 'Synced')}`,
	});
}

export class AnimeCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'anime',
			description:
				'Search anime details, live airing countdowns, cast, relations, and OP/ED themes.',
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
						.setDescription('Anime title or AniList ID')
						.setRequired(true)
						.setAutocomplete(true),
				),
		);
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		const query = interaction.options.getString('query', true);
		const ctx = await this.container.context.getUserContext(interaction.user.id);

		const anime = await getAnimeByIdOrSearch(query);
		if (!anime) {
			await this.container.cv2.notify(interaction, {
				status: 'ERROR',
				title: 'Anime Not Found',
				message: `No anime matching \`${query}\` could be found on AniList or MyAnimeList.`,
				ephemeral: true,
			});
			return;
		}

		const container = buildAnimeCardContainer({
			ownerId: interaction.user.id,
			anime,
			tab: 'overview',
			titleMode: ctx.settings.titleLanguage,
		});

		await interaction.reply({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
		});
	}

	public static async fetchThemesForTab(anilistId: number): Promise<AnimeThemeEntry[]> {
		return getAnimeThemesByAnilistId(anilistId);
	}
}
