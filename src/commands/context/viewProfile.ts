import { Command } from '@sapphire/framework';
import { ApplicationCommandType, MessageFlags } from 'discord.js';
import { buildProfileCardContainer } from '../user/profile.ts';

export class ViewProfileContextCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'View Neko Profile',
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
		const ctx = await this.container.context.getUserContext(targetUser.id);

		const container = buildProfileCardContainer({
			ownerId: interaction.user.id,
			targetUserId: targetUser.id,
			targetUsername: targetUser.username,
			targetAvatarUrl: targetUser.displayAvatarURL({ size: 256 }),
			ctx,
			tab: 'overview',
		});

		await interaction.reply({
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			components: [container],
		});
	}
}
