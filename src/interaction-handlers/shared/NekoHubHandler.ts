import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { type ButtonInteraction, MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import {
	type NekoGuideCategory,
	type NekoHubTab,
	buildNekoHubContainer,
} from '../../commands/utility/neko.ts';

export class NekoHubHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.MessageComponent,
		});
	}

	public override parse(interaction: ButtonInteraction | StringSelectMenuInteraction) {
		if (!interaction.customId.startsWith('neko:')) {
			return this.none();
		}
		return this.some();
	}

	public override async run(
		interaction: ButtonInteraction | StringSelectMenuInteraction,
	): Promise<void> {
		const validation = this.container.cv2.validateInteractionAccess(
			interaction.customId,
			interaction.user.id,
		);

		if (!validation.ok) {
			if (validation.reason === 'NOT_OWNER') {
				await this.container.cv2.notify(interaction, {
					status: 'ACCESS DENIED',
					title: 'Menu Locked to Owner',
					message: 'Run `/neko` to open your own interactive Neko hub.',
					ephemeral: true,
				});
				return;
			}

			await this.container.cv2.notify(interaction, {
				status: 'EXPIRED',
				title: 'Interactive Session Expired',
				message: 'This view has expired after 14 minutes. Run `/neko` to open a fresh hub.',
				ephemeral: true,
			});
			return;
		}

		const { action, state, extra, createdAtMs } = validation.data;

		let tab: NekoHubTab = 'guide';
		let guideCategory: NekoGuideCategory = (extra as NekoGuideCategory) || 'media';

		if (action === 'tab') {
			tab = (state as NekoHubTab) || 'guide';
		} else if (action === 'guide' && interaction.isStringSelectMenu()) {
			tab = 'guide';
			guideCategory = (interaction.values[0] as NekoGuideCategory | undefined) ?? 'media';
		}

		const container = buildNekoHubContainer({
			ownerId: interaction.user.id,
			tab,
			guideCategory,
			wsPing: interaction.client.ws.ping,
			guildCount: interaction.client.guilds.cache.size,
			commandCount: this.container.stores.get('commands').size,
			handlerCount: this.container.stores.get('interaction-handlers').size,
			createdAtMs,
		});

		await interaction.update({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
		});
	}
}
