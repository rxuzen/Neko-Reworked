import { Events, type InteractionHandlerError, Listener, UserError } from '@sapphire/framework';

export class InteractionHandlerErrorListener extends Listener<
	typeof Events.InteractionHandlerError
> {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, {
			...options,
			event: Events.InteractionHandlerError,
		});
	}

	public override async run(error: unknown, payload: InteractionHandlerError): Promise<void> {
		const { interaction, handler } = payload;

		if (!(error instanceof UserError)) {
			this.container.logger.error(
				error,
				`Error in interaction handler "${handler.name}" (User: ${interaction.user.id})`,
			);
		}

		if (!interaction.isRepliable()) return;

		const displayMessage =
			error instanceof UserError
				? error.message
				: 'An unexpected error occurred while processing this interaction.';

		try {
			await this.container.cv2.notify(interaction, {
				status: 'ERROR',
				title: 'Interaction Failed',
				subtitle: `Handler: ${handler.name}`,
				message: displayMessage,
				footerMessage: 'Interaction halted',
				ephemeral: true,
			});
		} catch (replyError) {
			this.container.logger.debug(
				replyError,
				'Failed to send CV2 error response for interaction handler',
			);
		}
	}
}
