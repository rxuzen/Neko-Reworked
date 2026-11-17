import { Command } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ContainerBuilder,
	type MessageActionRowComponentBuilder,
	MessageFlags,
} from 'discord.js';
import { l1Cache } from '../../lib/cache.ts';
import { encodeCustomId } from '../../lib/cv2/CustomId.ts';
import { createNekoContainer } from '../../lib/cv2/NekoLayout.ts';
import { formatStatus, statusFooter } from '../../lib/cv2/TimeAndStatus.ts';
import { hashImageQuery, searchSauce } from '../../services/saucenao.service.ts';
import type { SauceMatchResult } from '../../services/tracemoe.service.ts';

export interface BuildSauceCardOptions {
	ownerId: string;
	queryHash: string;
	matches: readonly SauceMatchResult[];
	index: number;
	createdAtMs?: number;
}

export function buildSauceCardContainer(options: BuildSauceCardOptions): ContainerBuilder {
	const createdAtMs = options.createdAtMs ?? Date.now();
	const { ownerId, queryHash, matches } = options;
	const safeIndex = Math.max(0, Math.min(matches.length - 1, options.index));
	const match = matches[safeIndex];

	if (!match) {
		return createNekoContainer({
			title: `${formatStatus('ERROR')} No Artwork or Anime Source Found`,
			subtitle: 'SauceNAO & Trace.moe Reverse Lookup',
			fields: [
				{
					key: 'NO MATCHES',
					value:
						'Neither SauceNAO nor Trace.moe returned a confident match for the provided image.',
				},
			],
			footer: statusFooter('UPDATED', 'Lookup completed'),
		});
	}

	const confidenceBadge =
		match.similarity >= 80
			? formatStatus('CONFIRMED')
			: match.similarity >= 55
				? formatStatus('APPROVED')
				: '[ LOW CONFIDENCE ]';

	const prevBtn = new ButtonBuilder()
		.setCustomId(
			encodeCustomId({
				domain: 'sce',
				action: 'page',
				ownerId,
				state: String(safeIndex - 1),
				extra: queryHash,
				createdAtMs,
			}),
		)
		.setLabel('◀ Prev Match')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(safeIndex <= 0);

	const nextBtn = new ButtonBuilder()
		.setCustomId(
			encodeCustomId({
				domain: 'sce',
				action: 'page',
				ownerId,
				state: String(safeIndex + 1),
				extra: queryHash,
				createdAtMs,
			}),
		)
		.setLabel('Next Match ▶')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(safeIndex >= matches.length - 1);

	const sourceBtn = new ButtonBuilder()
		.setLabel('Open Source ↗')
		.setStyle(ButtonStyle.Link)
		.setURL(match.externalUrl);

	const controlRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
		prevBtn,
		nextBtn,
		sourceBtn,
	);

	const detailLines = [
		`**Similarity:** **${match.similarity}%** ${confidenceBadge}`,
		`**Creator / Source:** ${match.authorOrStudio}`,
		...(match.episodeOrPart ? [`**Episode / Part:** ${match.episodeOrPart}`] : []),
		`**Engine:** \`${match.provider}\` (Match ${safeIndex + 1} of ${matches.length})`,
	];

	return createNekoContainer({
		title: match.title,
		subtitle: `${confidenceBadge}  |  ${match.similarity}% Similarity  |  Via ${match.provider}`,
		thumbnailUrl: match.thumbnailUrl ?? undefined,
		fields: [
			{
				key: 'SOURCE ATTRIBUTION',
				value: detailLines.join('\n'),
			},
		],
		controls: [controlRow],
		footer: `Match ${safeIndex + 1} / ${matches.length}  |  ${statusFooter('UPDATED', 'Reverse lookup complete')}`,
	});
}

export class SauceCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'sauce',
			description:
				'Find the anime or artwork source of an uploaded image or URL via SauceNAO & Trace.moe.',
			cooldownDelay: 4_000,
		});
	}

	public override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.addAttachmentOption((opt) =>
					opt
						.setName('image')
						.setDescription('Upload an anime screenshot or illustration')
						.setRequired(false),
				)
				.addStringOption((opt) =>
					opt.setName('url').setDescription('Direct image URL to identify').setRequired(false),
				),
		);
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		const attachment = interaction.options.getAttachment('image');
		const rawUrl = interaction.options.getString('url');
		const targetUrl = attachment?.url ?? rawUrl?.trim();

		if (!targetUrl || !targetUrl.startsWith('http')) {
			await this.container.cv2.notify(interaction, {
				status: 'ERROR',
				title: 'Missing Image Input',
				message:
					'Please provide either an uploaded `image` attachment or a valid `http(s)://` image `url`.',
				ephemeral: true,
			});
			return;
		}

		await interaction.deferReply();

		const queryHash = hashImageQuery(targetUrl);
		const matches = await searchSauce(targetUrl);
		l1Cache.set(`sauce_session:${queryHash}`, matches, 15 * 60_000);

		const container = buildSauceCardContainer({
			ownerId: interaction.user.id,
			queryHash,
			matches,
			index: 0,
		});

		await interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
		});
	}
}
