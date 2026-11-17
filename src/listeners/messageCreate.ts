import { Events, Listener } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { eq, sql } from 'drizzle-orm';
import { PROGRESSION_LIMITS } from '../config/constants.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema/index.ts';
import { checkAndSetCooldown } from '../lib/redis.ts';
import { calculateRequiredXpForLevel } from '../utilities/ContextUtility.ts';

export function calculateChatXpAndDrop(
	effectiveXpBonus: number,
	randomValue: number = Math.random(),
): { earnedXp: number; droppedShards: number } {
	const range = PROGRESSION_LIMITS.CHAT_XP_MAX - PROGRESSION_LIMITS.CHAT_XP_MIN + 1;
	const baseXp = PROGRESSION_LIMITS.CHAT_XP_MIN + Math.floor(randomValue * range);
	const earnedXp = Math.max(1, Math.round(baseXp * (1 + effectiveXpBonus)));

	const droppedShards =
		randomValue < PROGRESSION_LIMITS.CHAT_DROP_CHANCE ? 1 + Math.floor((randomValue * 100) % 3) : 0;

	return { earnedXp, droppedShards };
}

export class MessageCreateListener extends Listener<typeof Events.MessageCreate> {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, {
			...options,
			event: Events.MessageCreate,
		});
	}

	public override async run(message: Message): Promise<void> {
		if (
			message.author.bot ||
			message.webhookId ||
			!message.guildId ||
			message.content.trim().length < 4
		) {
			return;
		}

		const userId = message.author.id;
		const cd = await checkAndSetCooldown(
			`chatxp:${userId}`,
			PROGRESSION_LIMITS.CHAT_XP_COOLDOWN_SECONDS * 1_000,
		);
		if (cd.onCooldown) {
			return;
		}

		try {
			const ctx = await this.container.context.getUserContext(userId);
			const { earnedXp, droppedShards } = calculateChatXpAndDrop(ctx.effectiveXpMultiplierBonus);

			let nextXp = ctx.user.xp + earnedXp;
			let nextLevel = ctx.user.level;
			const reqXp = calculateRequiredXpForLevel(nextLevel);

			if (nextXp >= reqXp && nextLevel < PROGRESSION_LIMITS.MAX_USER_LEVEL) {
				nextXp -= reqXp;
				nextLevel += 1;
			}

			await db
				.update(users)
				.set({
					xp: nextXp,
					level: nextLevel,
					shards: droppedShards > 0 ? sql`${users.shards} + ${droppedShards}` : ctx.user.shards,
					updatedAt: new Date(),
				})
				.where(eq(users.id, userId))
				.catch(() => {});
		} catch {
			// Ignore passive XP background errors
		}
	}
}
