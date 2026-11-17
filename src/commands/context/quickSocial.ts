import { Command } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ApplicationCommandType,
	type MessageActionRowComponentBuilder,
	MessageFlags,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from 'discord.js';
import { encodeCustomId } from '../../lib/cv2/CustomId.ts';
import { createNekoContainer } from '../../lib/cv2/NekoLayout.ts';
import { statusFooter } from '../../lib/cv2/TimeAndStatus.ts';
import { SOCIAL_ACTIONS, SOCIAL_ACTION_META } from '../../services/media.service.ts';

export class QuickSocialContextCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'Quick Social Action',
			cooldownDelay: 2_000,
		});
	}

	public override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerContextMenuCommand((builder) =>
			builder.setName(this.name).setType(ApplicationCommandType.User),
		);
	}

	public override async contextMenuRun(
		interaction: Command.ContextMenuCommandInteraction,
	): Promise<void> {
		if (!interaction.isUserContextMenuCommand()) return;

		const targetUser = interaction.targetUser;
		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'soc',
					action: 'ctxsend',
					ownerId: interaction.user.id,
					state: 'hug',
					extra: targetUser.id,
				}),
			)
			.setPlaceholder(`Choose an anime reaction for ${targetUser.username}...`)
			.addOptions(
				SOCIAL_ACTIONS.map((act) =>
					new StringSelectMenuOptionBuilder()
						.setValue(act)
						.setLabel(SOCIAL_ACTION_META[act].label)
						.setDescription(
							`Send a ${SOCIAL_ACTION_META[act].label.toLowerCase()} GIF to ${targetUser.username}`,
						),
				),
			);

		const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(selectMenu);

		const container = createNekoContainer({
			title: 'Quick Social Action',
			subtitle: `Target: ${targetUser.username}`,
			fields: [
				{
					key: 'SELECT REACTION',
					value: `Choose an action below to send an anime reaction GIF to <@${targetUser.id}>.`,
				},
			],
			controls: [row],
			footer: statusFooter('CONFIRMED', 'Select an action to post'),
		});

		await interaction.reply({
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			components: [container],
		});
	}
}
