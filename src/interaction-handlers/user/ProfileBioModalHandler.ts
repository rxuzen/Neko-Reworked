import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { buildProfileCardContainer } from '../../commands/user/profile.ts';
import { db } from '../../db/index.ts';
import { users } from '../../db/schema/index.ts';

export const bioModalSchema = z
	.string()
	.trim()
	.min(1, 'Bio cannot be empty.')
	.max(240, 'Bio cannot exceed 240 characters.')
	.refine(
		(val) => !/(discord\.gg\/|https?:\/\/)/i.test(val),
		'External URLs and invite links are not allowed in profile biographies.',
	);

export class ProfileBioModalHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
		});
	}

	public override parse(interaction: ModalSubmitInteraction) {
		if (!interaction.customId.startsWith('prf:biomodal:')) {
			return this.none();
		}
		return this.some();
	}

	public override async run(interaction: ModalSubmitInteraction): Promise<void> {
		const validation = this.container.cv2.validateInteractionAccess(
			interaction.customId,
			interaction.user.id,
		);

		if (!validation.ok) {
			await this.container.cv2.notify(interaction, {
				status: 'EXPIRED',
				title: 'Bio Editor Expired',
				message: 'Please reopen `/profile` -> `CUSTOMIZE` to update your bio.',
				ephemeral: true,
			});
			return;
		}

		const rawBio = interaction.fields.getTextInputValue('bio_text');
		const parsed = bioModalSchema.safeParse(rawBio);

		if (!parsed.success) {
			await this.container.cv2.notify(interaction, {
				status: 'ERROR',
				title: 'Invalid Biography Text',
				message: parsed.error.issues[0]?.message ?? 'Invalid biography format.',
				ephemeral: true,
			});
			return;
		}

		const lock = await this.container.context.acquireActionLock(interaction.user.id);
		if (!lock.acquired) return;

		try {
			const cleanBio = parsed.data;
			await db
				.update(users)
				.set({ bio: cleanBio, updatedAt: new Date() })
				.where(eq(users.id, interaction.user.id))
				.catch(() => {});

			const ctx = await this.container.context.getUserContext(interaction.user.id);
			ctx.user.bio = cleanBio;

			const container = buildProfileCardContainer({
				ownerId: interaction.user.id,
				targetUserId: interaction.user.id,
				targetUsername: interaction.user.username,
				targetAvatarUrl: interaction.user.displayAvatarURL({ size: 256 }),
				ctx,
				tab: 'customize',
				footerNotice: 'Biography updated',
				createdAtMs: validation.data.createdAtMs,
			});

			if (interaction.isFromMessage()) {
				await interaction.update({
					flags: MessageFlags.IsComponentsV2,
					components: [container],
				});
				return;
			}

			await interaction.reply({
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
				components: [container],
			});
		} finally {
			await lock.release();
		}
	}
}
