import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
	type ButtonInteraction,
	MessageFlags,
	type StringSelectMenuInteraction,
	type UserSelectMenuInteraction,
} from 'discord.js';
import { and, eq, sql } from 'drizzle-orm';
import {
	type EconomyHubTab,
	QUEST_DEFINITIONS,
	buildEconomyCardContainer,
} from '../../commands/economy/economy.ts';
import { PROGRESSION_LIMITS } from '../../config/constants.ts';
import { db } from '../../db/index.ts';
import { inventory, loans, quests, users } from '../../db/schema/index.ts';
import { SHOP_CATALOG } from '../../db/seed.ts';
import { checkAndSetCooldown } from '../../lib/redis.ts';

export class EconomyHubHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.MessageComponent,
		});
	}

	public override parse(
		interaction: ButtonInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction,
	) {
		if (!interaction.customId.startsWith('eco:')) {
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
					validation.reason === 'NOT_OWNER'
						? 'Economy Hub Locked to Owner'
						: 'Economy Session Expired',
				message:
					validation.reason === 'NOT_OWNER'
						? 'Run `/economy` to open your own personal financial dashboard.'
						: 'This view expired after 14 minutes. Run `/economy` again to refresh.',
				ephemeral: true,
			});
			return;
		}

		const { action, ownerId, state, extra, createdAtMs } = validation.data;
		let selectedTargetId = extra && extra !== '_' ? extra : null;

		if (action === 'selectuser' && interaction.isUserSelectMenu()) {
			const picked = interaction.users.first();
			if (picked && picked.id !== ownerId && !picked.bot) {
				selectedTargetId = picked.id;
			}
		}

		// Two-party P2P actions (Give / Rob) use acquireDualActionLock
		if (
			(action === 'give' || action === 'rob') &&
			selectedTargetId &&
			selectedTargetId !== ownerId
		) {
			const dualLock = await this.container.context.acquireDualActionLock(
				ownerId,
				selectedTargetId,
			);
			if (!dualLock.acquired) return;

			try {
				const [senderCtx, receiverCtx] = await Promise.all([
					this.container.context.getUserContext(ownerId),
					this.container.context.getUserContext(selectedTargetId),
				]);

				let footerNotice = '';

				if (action === 'give') {
					const amount = 500;
					const netAmount = 475; // 5% guild tax
					if (senderCtx.user.coins < amount) {
						await this.container.cv2.notify(interaction, {
							status: 'ERROR',
							title: 'Insufficient Wallet Coins',
							message: 'You need at least **500 Coins** in your wallet to send a transfer.',
							ephemeral: true,
						});
						return;
					}

					senderCtx.user.coins -= amount;
					await db
						.transaction(async (tx) => {
							await tx
								.update(users)
								.set({
									coins: sql`${users.coins} - ${amount}`,
									updatedAt: new Date(),
								})
								.where(eq(users.id, ownerId));
							await tx
								.update(users)
								.set({
									coins: sql`${users.coins} + ${netAmount}`,
									updatedAt: new Date(),
								})
								.where(eq(users.id, selectedTargetId));
						})
						.catch(() => {});

					footerNotice = `Transferred 475 Coins to user ${selectedTargetId} (25 Coin tax)`;
				} else if (action === 'rob') {
					const cd = await checkAndSetCooldown(`rob:${ownerId}`, 1_800_000);
					if (cd.onCooldown) {
						await this.container.cv2.notify(interaction, {
							status: 'COOLDOWN',
							title: 'Heist Heat Active',
							message: `Lay low for **${this.container.cv2.formatDurationCompact(cd.remainingMs)}** before attempting another heist!`,
							ephemeral: true,
						});
						return;
					}

					if (receiverCtx.user.coins < 200) {
						footerNotice = 'Target keeps all their coins safely in their Anti-Rob Vault!';
					} else {
						const stolen = Math.min(400, Math.max(50, Math.floor(receiverCtx.user.coins * 0.15)));
						senderCtx.user.coins += stolen;
						await db
							.transaction(async (tx) => {
								await tx
									.update(users)
									.set({
										coins: sql`${users.coins} - ${stolen}`,
										updatedAt: new Date(),
									})
									.where(eq(users.id, selectedTargetId));
								await tx
									.update(users)
									.set({
										coins: sql`${users.coins} + ${stolen}`,
										updatedAt: new Date(),
									})
									.where(eq(users.id, ownerId));
							})
							.catch(() => {});

						footerNotice = `Heist succeeded! Pickpocketed +${stolen} Wallet Coins`;
					}
				}

				const container = buildEconomyCardContainer({
					ownerId,
					ctx: senderCtx,
					tab: 'transfer',
					selectedTargetId,
					footerNotice,
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

		// Single-user economy mutations
		const lock = await this.container.context.acquireActionLock(ownerId);
		if (!lock.acquired) return;

		try {
			const ctx = await this.container.context.getUserContext(ownerId);
			let tab: EconomyHubTab = 'wallet';
			let footerNotice: string | undefined;

			if (action === 'tab') {
				tab = (state as EconomyHubTab) || 'wallet';
			} else if (action === 'selectuser') {
				tab = 'transfer';
				footerNotice = selectedTargetId ? `Selected member ${selectedTargetId}` : undefined;
			} else if (action === 'vault') {
				tab = 'wallet';
				const freeSpace = Math.max(0, ctx.user.vaultCapacity - ctx.user.vaultCoins);
				if (state === 'dep1k' || state === 'depmax') {
					const requested = state === 'dep1k' ? 1_000 : ctx.user.coins;
					const delta = Math.min(ctx.user.coins, freeSpace, requested);
					if (delta > 0) {
						ctx.user.coins -= delta;
						ctx.user.vaultCoins += delta;
						await db
							.update(users)
							.set({
								coins: sql`${users.coins} - ${delta}`,
								vaultCoins: sql`${users.vaultCoins} + ${delta}`,
								updatedAt: new Date(),
							})
							.where(eq(users.id, ownerId))
							.catch(() => {});
						footerNotice = `Deposited ${delta.toLocaleString()} Coins into Vault`;
					}
				} else if (state === 'wit1k' || state === 'witall') {
					const requested = state === 'wit1k' ? 1_000 : ctx.user.vaultCoins;
					const delta = Math.min(ctx.user.vaultCoins, requested);
					if (delta > 0) {
						ctx.user.vaultCoins -= delta;
						ctx.user.coins += delta;
						await db
							.update(users)
							.set({
								vaultCoins: sql`${users.vaultCoins} - ${delta}`,
								coins: sql`${users.coins} + ${delta}`,
								updatedAt: new Date(),
							})
							.where(eq(users.id, ownerId))
							.catch(() => {});
						footerNotice = `Withdrew ${delta.toLocaleString()} Coins from Vault`;
					}
				}
			} else if (action === 'buy' && interaction.isStringSelectMenu()) {
				tab = 'shop';
				const itemId = interaction.values[0] ?? '';
				const item = SHOP_CATALOG.find((i) => i.id === itemId);
				if (!item) return;

				if (item.priceCoins > 0 && ctx.user.coins < item.priceCoins) {
					await this.container.cv2.notify(interaction, {
						status: 'ERROR',
						title: 'Insufficient Coins',
						message: `**${item.name}** costs **${item.priceCoins.toLocaleString()} Coins**, but you only have **${ctx.user.coins.toLocaleString()} Coins** in your wallet.`,
						ephemeral: true,
					});
					return;
				}
				if (item.priceGems > 0 && ctx.user.gems < item.priceGems) {
					await this.container.cv2.notify(interaction, {
						status: 'ERROR',
						title: 'Insufficient Gems',
						message: `**${item.name}** costs **${item.priceGems} Gems**, but you only have **${ctx.user.gems} Gems**.`,
						ephemeral: true,
					});
					return;
				}

				ctx.user.coins -= item.priceCoins;
				ctx.user.gems -= item.priceGems;
				if (item.xpMultiplierBonus && item.category === 'UPGRADE') {
					ctx.user.xpMultiplierPerm = Math.min(
						PROGRESSION_LIMITS.MAX_XP_MULTIPLIER_BONUS,
						ctx.user.xpMultiplierPerm + item.xpMultiplierBonus,
					);
				}
				if (item.coinMultiplierBonus && item.category === 'UPGRADE') {
					ctx.user.coinMultiplierPerm = Math.min(
						PROGRESSION_LIMITS.MAX_COIN_MULTIPLIER_BONUS,
						ctx.user.coinMultiplierPerm + item.coinMultiplierBonus,
					);
				}
				if (item.vaultCapacityBonus) {
					ctx.user.vaultCapacity += item.vaultCapacityBonus;
				}
				if (item.titleText) {
					ctx.user.equippedTitle = item.titleText;
				}

				await db
					.transaction(async (tx) => {
						await tx
							.update(users)
							.set({
								coins: sql`${users.coins} - ${item.priceCoins}`,
								gems: sql`${users.gems} - ${item.priceGems}`,
								xpMultiplierPerm: ctx.user.xpMultiplierPerm,
								coinMultiplierPerm: ctx.user.coinMultiplierPerm,
								vaultCapacity: ctx.user.vaultCapacity,
								equippedTitle: ctx.user.equippedTitle,
								updatedAt: new Date(),
							})
							.where(eq(users.id, ownerId));

						await tx
							.insert(inventory)
							.values({
								userId: ownerId,
								itemId: item.id,
								category: item.category,
								quantity: 1,
							})
							.onConflictDoUpdate({
								target: [inventory.userId, inventory.itemId],
								set: {
									quantity: sql`${inventory.quantity} + 1`,
									updatedAt: new Date(),
								},
							});
					})
					.catch(() => {});

				footerNotice = `Purchased ${item.name}`;
			} else if (action === 'claimquests') {
				tab = 'quests';
				const bonusCoins = 300;
				const bonusShards = 5;
				ctx.user.coins += bonusCoins;
				ctx.user.shards += bonusShards;
				await db
					.update(users)
					.set({
						coins: sql`${users.coins} + ${bonusCoins}`,
						shards: sql`${users.shards} + ${bonusShards}`,
						updatedAt: new Date(),
					})
					.where(eq(users.id, ownerId))
					.catch(() => {});
				footerNotice = `Synced commission progress (+${bonusCoins} Coins & +${bonusShards} Shards)`;
			} else if (action === 'borrow') {
				tab = 'transfer';
				const principal = 1_000;
				const repay = 1_050;
				const dueAt = new Date(Date.now() + 48 * 3_600_000);
				ctx.user.coins += principal;

				await db
					.transaction(async (tx) => {
						await tx
							.update(users)
							.set({
								coins: sql`${users.coins} + ${principal}`,
								updatedAt: new Date(),
							})
							.where(eq(users.id, ownerId));
						await tx.insert(loans).values({
							lenderId: selectedTargetId ?? ownerId,
							borrowerId: ownerId,
							principalCoins: principal,
							repayCoins: repay,
							status: 'ACTIVE',
							dueAt,
						});
					})
					.catch(() => {});

				footerNotice = 'Borrowed +1,000 Coins (Repay 1,050 Coins within 48h)';
			} else if (action === 'repay') {
				tab = 'transfer';
				const repayCost = 1_050;
				if (ctx.user.coins >= repayCost) {
					ctx.user.coins -= repayCost;
					await db
						.transaction(async (tx) => {
							await tx
								.update(users)
								.set({
									coins: sql`${users.coins} - ${repayCost}`,
									updatedAt: new Date(),
								})
								.where(eq(users.id, ownerId));
							await tx
								.update(loans)
								.set({ status: 'REPAID', resolvedAt: new Date() })
								.where(and(eq(loans.borrowerId, ownerId), eq(loans.status, 'ACTIVE')));
						})
						.catch(() => {});
					footerNotice = 'Repaid active loan (1,050 Coins)';
				}
			}

			const [userQuestRows, activeLoanRows] = await Promise.all([
				db
					.select()
					.from(quests)
					.where(eq(quests.userId, ownerId))
					.limit(QUEST_DEFINITIONS.length)
					.catch(() => []),
				db
					.select()
					.from(loans)
					.where(and(eq(loans.borrowerId, ownerId), eq(loans.status, 'ACTIVE')))
					.limit(5)
					.catch(() => []),
			]);

			const container = buildEconomyCardContainer({
				ownerId,
				ctx,
				tab,
				quests: userQuestRows,
				activeLoans: activeLoanRows,
				selectedTargetId,
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
