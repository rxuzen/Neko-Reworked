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
import { encodeCustomId } from '../../lib/cv2/CustomId.ts';
import { createNekoContainer } from '../../lib/cv2/NekoLayout.ts';
import { statusFooter } from '../../lib/cv2/TimeAndStatus.ts';
import {
	SOCIAL_ACTIONS,
	SOCIAL_ACTION_META,
	type SocialActionType,
	type SocialGifResult,
	fetchSocialGif,
} from '../../services/media.service.ts';

export interface BuildSocialCardOptions {
	ownerId: string;
	actorId: string;
	targetId: string | null;
	action: SocialActionType;
	gif: SocialGifResult;
	createdAtMs?: number;
}

export function buildSocialCardContainer(options: BuildSocialCardOptions): ContainerBuilder {
	const createdAtMs = options.createdAtMs ?? Date.now();
	const { ownerId, actorId, targetId, action, gif } = options;
	const meta = SOCIAL_ACTION_META[action] ?? SOCIAL_ACTION_META.hug;
	const targetState = targetId ?? actorId;

	const headline =
		!targetId || targetId === actorId
			? meta.selfTemplate(`<@${actorId}>`)
			: meta.targetTemplate(`<@${actorId}>`, `<@${targetId}>`);

	const rerollBtn = new ButtonBuilder()
		.setCustomId(
			encodeCustomId({
				domain: 'soc',
				action: 'reroll',
				ownerId,
				state: action,
				extra: targetState,
				createdAtMs,
			}),
		)
		.setLabel('Re-roll GIF')
		.setStyle(ButtonStyle.Secondary);

	const buttonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
		rerollBtn,
	);

	const actionSwitcher = new StringSelectMenuBuilder()
		.setCustomId(
			encodeCustomId({
				domain: 'soc',
				action: 'switch',
				ownerId,
				state: action,
				extra: targetState,
				createdAtMs,
			}),
		)
		.setPlaceholder('Switch reaction action...')
		.addOptions(
			SOCIAL_ACTIONS.map((act) =>
				new StringSelectMenuOptionBuilder()
					.setValue(act)
					.setLabel(SOCIAL_ACTION_META[act].label)
					.setDefault(act === action),
			),
		);

	const selectRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
		actionSwitcher,
	);

	return createNekoContainer({
		title: `Neko Social — ${meta.label}`,
		subtitle: `Anime: ${gif.animeName}  |  Source: ${gif.provider}`,
		fields: [
			{
				key: 'REACTION',
				value: headline,
			},
		],
		media: [
			{
				url: gif.url,
				description: `${meta.label} anime reaction GIF from ${gif.animeName}`,
			},
		],
		controls: [buttonRow, selectRow],
		footer: statusFooter('UPDATED', `Powered by ${gif.provider}`),
	});
}

export class SocialCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'social',
			description: 'Send an anime reaction GIF (hug, pat, poke, bonk, blush, etc.) to a member.',
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
						.setName('action')
						.setDescription('Reaction type (hug, pat, poke, bonk, blush, wave, etc.)')
						.setRequired(true)
						.setAutocomplete(true),
				)
				.addUserOption((opt) =>
					opt.setName('user').setDescription('Member to interact with').setRequired(false),
				),
		);
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		const rawAction = interaction.options
			.getString('action', true)
			.toLowerCase() as SocialActionType;
		const action: SocialActionType = SOCIAL_ACTIONS.includes(rawAction) ? rawAction : 'hug';
		const targetUser = interaction.options.getUser('user');

		const gif = await fetchSocialGif(action);
		const container = buildSocialCardContainer({
			ownerId: interaction.user.id,
			actorId: interaction.user.id,
			targetId: targetUser?.id ?? null,
			action,
			gif,
		});

		await interaction.reply({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
		});
	}
}
