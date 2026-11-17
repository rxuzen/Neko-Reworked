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
import { sanitizeAnimeText } from '../../lib/cv2/Formatters.ts';
import { type NekoFieldOption, createNekoContainer } from '../../lib/cv2/NekoLayout.ts';
import { formatStatus, statusFooter } from '../../lib/cv2/TimeAndStatus.ts';
import { getMangaByIdOrSearch } from '../../services/anilist.service.ts';
import type { MangaMediaDetail } from '../../services/jikan.service.ts';
import { resolvePreferredTitle } from './anime.ts';

export type MangaCardTab = 'overview' | 'characters' | 'adaptations';

export interface BuildMangaCardOptions {
	ownerId: string;
	manga: MangaMediaDetail;
	tab: MangaCardTab;
	titleMode: string;
	createdAtMs?: number;
}

export function buildMangaCardContainer(options: BuildMangaCardOptions): ContainerBuilder {
	const createdAtMs = options.createdAtMs ?? Date.now();
	const { manga, tab, ownerId, titleMode } = options;
	const displayTitle = resolvePreferredTitle(manga.titleRomaji, manga.titleEnglish, titleMode);
	const chText = manga.chapters ? `${manga.chapters} Chapters` : 'Ongoing';
	const volText = manga.volumes ? `${manga.volumes} Volumes` : 'Ongoing Vols';
	const subtitle = `${formatStatus(manga.status)}  |  ${manga.format}  |  ${chText}  |  ${volText}`;

	const tabKeys: readonly MangaCardTab[] = ['overview', 'characters', 'adaptations'];
	const tabs = tabKeys.map((t) => ({
		customId: encodeCustomId({
			domain: 'mng',
			action: 'tab',
			ownerId,
			state: t,
			extra: String(manga.id),
			createdAtMs,
		}),
		label: t.toUpperCase(),
		active: tab === t,
	}));

	const fields: NekoFieldOption[] = [];

	if (tab === 'overview') {
		const scoreStr = manga.averageScore ? `${manga.averageScore} / 10` : 'Unrated';
		fields.push({
			key: 'PUBLICATION DETAILS',
			value: [
				`**Format:** ${manga.format}  |  **Source:** ${manga.source}`,
				`**Chapters:** ${manga.chapters ?? 'Publishing'}  |  **Volumes:** ${manga.volumes ?? 'Publishing'}`,
				`**Score:** ${scoreStr}  |  **Popularity:** ${manga.popularity.toLocaleString()}  |  **Favorites:** ${manga.favourites.toLocaleString()}`,
			].join('\n'),
		});

		fields.push({
			key: 'GENRES',
			value: manga.genres.length > 0 ? manga.genres.join(', ') : 'Uncategorized',
		});

		fields.push({
			key: 'SYNOPSIS',
			value: sanitizeAnimeText(manga.description, 800),
		});
	} else if (tab === 'characters') {
		const charLines =
			manga.characters.length > 0
				? manga.characters.map((c) => `• **${c.name}** (\`${c.role}\`)`).join('\n')
				: 'No character records indexed for this manga.';

		fields.push({
			key: 'FEATURED CHARACTERS',
			value: charLines,
		});
	} else {
		const relLines =
			manga.adaptations.length > 0
				? manga.adaptations
						.map(
							(r) =>
								`• **[${r.title}](${r.siteUrl})** — \`${r.relationType}\` (${r.format} • ${formatStatus(r.status)})`,
						)
						.join('\n')
				: 'No anime adaptations or spin-offs linked to this entry.';

		fields.push({
			key: 'ADAPTATIONS & RELATED MEDIA',
			value: relLines,
		});
	}

	const linkBtn = new ButtonBuilder()
		.setLabel('AniList Page ↗')
		.setStyle(ButtonStyle.Link)
		.setURL(manga.siteUrl);

	const controlRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
		linkBtn,
	);

	return createNekoContainer({
		title: displayTitle,
		subtitle,
		thumbnailUrl: manga.coverImageUrl ?? undefined,
		tabs,
		fields,
		controls: [controlRow],
		footer: `AniList ID: ${manga.id}  |  Title Mode: ${titleMode}  |  ${statusFooter('UPDATED', 'Synced')}`,
	});
}

export class MangaCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'manga',
			description:
				'Search manga and light novels with chapters, volumes, characters, and adaptations.',
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
						.setDescription('Manga or Light Novel title')
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

		const manga = await getMangaByIdOrSearch(query);
		if (!manga) {
			await this.container.cv2.notify(interaction, {
				status: 'ERROR',
				title: 'Manga Not Found',
				message: `No manga or light novel matching \`${query}\` could be found.`,
				ephemeral: true,
			});
			return;
		}

		const container = buildMangaCardContainer({
			ownerId: interaction.user.id,
			manga,
			tab: 'overview',
			titleMode: ctx.settings.titleLanguage,
		});

		await interaction.reply({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
		});
	}
}
