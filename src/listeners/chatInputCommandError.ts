import {
	type ChatInputCommandErrorPayload,
	Events,
	Listener,
	UserError,
} from '@sapphire/framework';

export class ChatInputCommandErrorListener extends Listener<typeof Events.ChatInputCommandError> {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, {
			...options,
			event: Events.ChatInputCommandError,
		});
	}

	public override async run(error: unknown, payload: ChatInputCommandErrorPayload): Promise<void> {
		const { interaction, command } = payload;

		if (
			error instanceof UserError &&
			typeof error.context === 'object' &&
			error.context !== null &&
			'silent' in error.context &&
			(error.context as { silent?: boolean }).silent === true
		) {
			return;
		}

		if (!(error instanceof UserError)) {
			this.container.logger.error(
				error,
				`Error in chat input command "/${command.name}" (User: ${interaction.user.id})`,
			);
		}

		const displayMessage =
			error instanceof UserError
				? error.message
				: 'An unexpected error occurred while executing this command.';

		try {
			await this.container.cv2.notify(interaction, {
				status: 'ERROR',
				title: 'Command Execution Failed',
				subtitle: `Command: /${command.name}`,
				message: displayMessage,
				footerMessage: 'Command execution halted',
				ephemeral: true,
			});
		} catch (replyError) {
			this.container.logger.debug(
				replyError,
				'Failed to send CV2 error response for chat input command',
			);
		}
	}
}
