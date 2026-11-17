import {
	BucketScope,
	type ChatInputCommand,
	type Command,
	type ContextMenuCommand,
	Precondition,
	type Preconditions,
} from '@sapphire/framework';
import { checkAndSetCooldown } from '../lib/redis.ts';

export class CooldownPrecondition extends Precondition {
	public constructor(context: Precondition.LoaderContext, options: Precondition.Options) {
		super(context, {
			...options,
			name: 'Cooldown',
		});
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
		command: ChatInputCommand,
		context: Preconditions['Cooldown'],
	) {
		return this.handleCooldown(interaction, command.name, context);
	}

	public override async contextMenuRun(
		interaction: Command.ContextMenuCommandInteraction,
		command: ContextMenuCommand,
		context: Preconditions['Cooldown'],
	) {
		return this.handleCooldown(interaction, command.name, context);
	}

	private async handleCooldown(
		interaction: Command.ChatInputCommandInteraction | Command.ContextMenuCommandInteraction,
		commandName: string,
		context: Preconditions['Cooldown'],
	) {
		const delayMs = context.delay ?? 3_000;
		const scopeTarget =
			context.scope === BucketScope.Guild && interaction.guildId
				? interaction.guildId
				: interaction.user.id;
		const key = `${commandName}:${scopeTarget}`;

		const result = await checkAndSetCooldown(key, delayMs);
		if (!result.onCooldown) {
			return this.ok();
		}

		const humanRemaining = this.container.cv2.formatDurationCompact(result.remainingMs);
		const timestamp = this.container.cv2.discordTime(result.expiresAtUnix, 'R');

		if (interaction.isRepliable()) {
			await this.container.cv2.notify(interaction, {
				status: 'COOLDOWN',
				title: 'Command on Cooldown',
				subtitle: `Command: /${commandName}`,
				key: 'WAIT TIME',
				message: `Please wait **${humanRemaining}** before using \`/${commandName}\` again.\nReady ${timestamp}`,
				footerMessage: 'Rate limit active',
				ephemeral: true,
			});
		}

		return this.error({
			identifier: 'Cooldown',
			message: `Command /${commandName} is on cooldown.`,
			context: { silent: true },
		});
	}
}
