import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
	type ButtonInteraction,
	MessageFlags,
	type StringSelectMenuInteraction,
	type UserSelectMenuInteraction,
} from 'discord.js';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
	ANILIST_GACHA_POOL,
	type GachaHubTab,
	type GachaPullOutcome,
	buildGachaCardContainer,
	simulateBannerPull,
} from '../../commands/gacha/gacha.ts';
import { PROGRESSION_LIMITS } from '../../config/constants.ts';
import { db } from '../../db/index.ts';
import { gachaCards, gachaPity, gachaWishlists, users } from '../../db/schema/index.ts';

const DUPLICATE_STAR_SHARDS: Record<'R' | 'SR' | 'SSR' | 'UR', number> = {
	R: 2,
	SR: 5,
	SSR: 15,
	UR: 30,
};

export class GachaHubHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.MessageComponent,
		});
	}

	public override parse(
		interaction: ButtonInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction,
	) {
		if (!interaction.customId.startsWith('gac:')) {
			return this.none();
		}
		return this.some();
	}

	public override async run(
		interaction: ButtonInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction,
	): Promise<void> {
		const validation = this.container.cv2.validateInteractionAccess(
			interaction.customId,
			interaction.user.id,
		);

		if (!validation.ok) {
			await this.container.cv2.notify(interaction, {
				status: validation.reason === 'NOT_OWNER' ? 'ACCESS DENIED' : 'EXPIRED',
				title:
					validation.reason === 'NOT_OWNER' ? 'Gacha Hub Locked to Owner' : 'Gacha Session Expired',
				message:
					validation.reason === 'NOT_OWNER'
						? 'Run `/gacha` to open your own personal summon banner.'
						: 'This view expired after 14 minutes. Run `/gacha` again to refresh.',
				ephemeral: true,
			});
			return;
		}

		const { action, ownerId, state, extra, createdAtMs } = validation.data;
		let selectedTradeTargetId =
			extra && extra !== '_' && extra !== 'ANILIST' && extra !== 'POKEDEX' ? extra : null;

		if (action === 'selectpartner' && interaction.isUserSelectMenu()) {
			const picked = interaction.users.first();
			if (picked && picked.id !== ownerId && !picked.bot) {
				selectedTradeTargetId = picked.id;
			}
		}

		// Two-party P2P Shard Trade uses acquireDualActionLock
		if (action === 'tradesend' && selectedTradeTargetId && selectedTradeTargetId !== ownerId) {
			const dualLock = await this.container.context.acquireDualActionLock(
				ownerId,
				selectedTradeTargetId,
			);
			if (!dualLock.acquired) return;

			try {
				const [senderCtx] = await Promise.all([
					this.container.context.getUserContext(ownerId),
					this.container.context.getUserContext(selectedTradeTargetId),
				]);

				if (senderCtx.user.shards < 20) {
					await this.container.cv2.notify(interaction, {
						status: 'ERROR',
						title: 'Insufficient Shards',
						message: 'You need at least **20 Shards** to execute a P2P shard transfer.',
						ephemeral: true,
					});
					return;
				}

				senderCtx.user.shards -= 20;
				await db
					.transaction(async (tx) => {
						await tx
							.update(users)
							.set({
								shards: sql`${users.shards} - 20`,
								updatedAt: new Date(),
							})
							.where(eq(users.id, ownerId));
						await tx
							.update(users)
							.set({
								shards: sql`${users.shards} + 20`,
								updatedAt: new Date(),
							})
							.where(eq(users.id, selectedTradeTargetId));
					})
					.catch(() => {});

				const container = buildGachaCardContainer({
					ownerId,
					ctx: senderCtx,
					tab: 'trade',
					selectedTradeTargetId,
					footerNotice: `Sent 20 Shards to trading partner ${selectedTradeTargetId}`,
					createdAtMs,
				});

				await interaction.update({
					flags: MessageFlags.IsComponentsV2,
					components: [container],
				});
			} finally {
				await dualLock.release();
			}
			return;
		}

		// Single-user Gacha actions
		const lock = await this.container.context.acquireActionLock(ownerId);
		if (!lock.acquired) return;

		try {
			const ctx = await this.container.context.getUserContext(ownerId);
			let tab: GachaHubTab = (state as GachaHubTab) || 'anilist';
			const bannerType: 'ANILIST' | 'POKEDEX' =
				tab === 'pokedex' || extra === 'POKEDEX' ? 'POKEDEX' : 'ANILIST';
			let footerNotice: string | undefined;
			const lastPullResults: GachaPullOutcome[] = [];

			const [pityRows, wishlistRows] = await Promise.all([
				db
					.select()
					.from(gachaPity)
					.where(and(eq(gachaPity.userId, ownerId), eq(gachaPity.banner, bannerType)))
					.limit(1)
					.catch(() => []),
				db
					.select()
					.from(gachaWishlists)
					.where(and(eq(gachaWishlists.userId, ownerId), eq(gachaWishlists.banner, 'ANILIST')))
					.limit(3)
					.catch(() => []),
			]);

			let currentPity: { pullsSinceSsr: number; totalPulls: number } = {
				pullsSinceSsr: pityRows[0]?.pullsSinceSsr ?? 0,
				totalPulls: pityRows[0]?.totalPulls ?? 0,
			};

			if (action === 'tab') {
				tab = (state as GachaHubTab) || 'anilist';
			} else if (action === 'convert') {
				const coinCost = 250;
				if (ctx.user.coins >= coinCost) {
					ctx.user.coins -= coinCost;
					ctx.user.shards += 10;
					await db
						.update(users)
						.set({
							coins: sql`${users.coins} - ${coinCost}`,
							shards: sql`${users.shards} + 10`,
							updatedAt: new Date(),
						})
						.where(eq(users.id, ownerId))
						.catch(() => {});
					footerNotice = 'Converted 250 Coins -> +10 Gacha Shards';
				}
			} else if (action === 'pull1' || action === 'pull10') {
				const count = action === 'pull10' ? 10 : 1;
				const shardCost = action === 'pull10' ? 90 : 10;

				if (ctx.user.shards < shardCost) {
					await this.container.cv2.notify(interaction, {
						status: 'ERROR',
						title: 'Insufficient Gacha Shards',
						message: `You need **${shardCost} Shards** for this summon (You have **${ctx.user.shards} Shards**).`,
						ephemeral: true,
					});
					return;
				}

				let pullsSinceSsr = currentPity.pullsSinceSsr;
				let bonusStarShards = 0;

				for (let i = 0; i < count; i++) {
					const guaranteedSr = count === 10 && i === 9;
					const sim = simulateBannerPull(bannerType, pullsSinceSsr, wishlistRows, guaranteedSr);
					pullsSinceSsr = sim.nextPullsSinceSsr;
					lastPullResults.push(sim.outcome);
					bonusStarShards += DUPLICATE_STAR_SHARDS[sim.outcome.rarity];
				}

				currentPity = {
					pullsSinceSsr,
					totalPulls: currentPity.totalPulls + count,
				};
				ctx.user.shards -= shardCost;
				ctx.user.starShards += bonusStarShards;

				await db
					.transaction(async (tx) => {
						await tx
							.update(users)
							.set({
								shards: sql`${users.shards} - ${shardCost}`,
								starShards: sql`${users.starShards} + ${bonusStarShards}`,
								updatedAt: new Date(),
							})
							.where(eq(users.id, ownerId));

						await tx
							.insert(gachaPity)
							.values({
								userId: ownerId,
								banner: bannerType,
								pullsSinceSsr: currentPity.pullsSinceSsr,
								totalPulls: currentPity.totalPulls,
							})
							.onConflictDoUpdate({
								target: [gachaPity.userId, gachaPity.banner],
								set: {
									pullsSinceSsr: currentPity.pullsSinceSsr,
									totalPulls: currentPity.totalPulls,
									updatedAt: new Date(),
								},
							});

						for (const outcome of lastPullResults) {
							await tx
								.insert(gachaCards)
								.values({
									userId: ownerId,
									banner: outcome.banner,
									externalId: outcome.externalId,
									name: outcome.name,
									seriesOrType: outcome.seriesOrType,
									rarity: outcome.rarity,
									stars: 1,
									duplicates: 0,
									imageUrl: outcome.imageUrl,
									altImageUrl: outcome.altImageUrl,
								})
								.onConflictDoUpdate({
									target: [gachaCards.userId, gachaCards.banner, gachaCards.externalId],
									set: {
										duplicates: sql`${gachaCards.duplicates} + 1`,
									},
								});
						}
					})
					.catch(() => {});

				footerNotice = `Summoned x${count} on ${bannerType} Banner (+${bonusStarShards} Star Shards)`;
			} else if (action === 'setwish' && interaction.isStringSelectMenu()) {
				tab = 'anilist';
				const pickedId = Number.parseInt(interaction.values[0] ?? '0', 10);
				const targetEntry = ANILIST_GACHA_POOL.find((c) => c.id === pickedId);
				if (targetEntry) {
					const nextSlot = (wishlistRows.length % 3) + 1;
					await db
						.insert(gachaWishlists)
						.values({
							userId: ownerId,
							banner: 'ANILIST',
							slot: nextSlot,
							externalId: targetEntry.id,
							name: targetEntry.name,
						})
						.onConflictDoUpdate({
							target: [gachaWishlists.userId, gachaWishlists.banner, gachaWishlists.slot],
							set: {
								externalId: targetEntry.id,
								name: targetEntry.name,
							},
						})
						.catch(() => {});
					footerNotice = `Pinned ${targetEntry.name} to Wishlist Slot ${nextSlot}/3`;
				}
			} else if (action === 'ascend' && interaction.isStringSelectMenu()) {
				tab = 'collection';
				const cardId = Number.parseInt(interaction.values[0] ?? '0', 10);
				const starCost = 15;
				if (ctx.user.starShards < starCost) {
					await this.container.cv2.notify(interaction, {
						status: 'ERROR',
						title: 'Insufficient Star Shards',
						message: `Ascending a card requires **15 Star Shards** (You have **${ctx.user.starShards} Star Shards**).`,
						ephemeral: true,
					});
					return;
				}

				ctx.user.starShards -= starCost;
				await db
					.transaction(async (tx) => {
						await tx
							.update(users)
							.set({
								starShards: sql`${users.starShards} - ${starCost}`,
								updatedAt: new Date(),
							})
							.where(eq(users.id, ownerId));
						await tx
							.update(gachaCards)
							.set({
								stars: sql`LEAST(${PROGRESSION_LIMITS.GACHA_MAX_STARS}, ${gachaCards.stars} + 1)`,
							})
							.where(and(eq(gachaCards.id, cardId), eq(gachaCards.userId, ownerId)));
					})
					.catch(() => {});

				footerNotice = 'Card ascended by +1 ★ (-15 Star Shards)';
			} else if (action === 'refinestar') {
				tab = 'trade';
				if (ctx.user.shards >= 20) {
					ctx.user.shards -= 20;
					ctx.user.starShards += 10;
					await db
						.update(users)
						.set({
							shards: sql`${users.shards} - 20`,
							starShards: sql`${users.starShards} + 10`,
							updatedAt: new Date(),
						})
						.where(eq(users.id, ownerId))
						.catch(() => {});
					footerNotice = 'Refined 20 Shards -> +10 Star Shards';
				}
			}

			const [collectionRows, updatedWishes] = await Promise.all([
				db
					.select()
					.from(gachaCards)
					.where(eq(gachaCards.userId, ownerId))
					.orderBy(desc(gachaCards.stars), desc(gachaCards.id))
					.limit(15)
					.catch(() => []),
				db
					.select()
					.from(gachaWishlists)
					.where(and(eq(gachaWishlists.userId, ownerId), eq(gachaWishlists.banner, 'ANILIST')))
					.limit(3)
					.catch(() => wishlistRows),
			]);

			const container = buildGachaCardContainer({
				ownerId,
				ctx,
				tab,
				pity: {
					userId: ownerId,
					banner: bannerType,
					pullsSinceSsr: currentPity.pullsSinceSsr,
					totalPulls: currentPity.totalPulls,
					updatedAt: new Date(),
				},
				wishlists: updatedWishes,
				collection: collectionRows,
				lastPullResults,
				selectedTradeTargetId,
				footerNotice,
				createdAtMs,
			});

			await interaction.update({
				flags: MessageFlags.IsComponentsV2,
				components: [container],
			});
		} finally {
			await lock.release();
		}
	}
}
