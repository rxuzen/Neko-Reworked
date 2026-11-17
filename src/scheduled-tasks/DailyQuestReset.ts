import { eq, lte } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { quests } from '../db/schema/index.ts';
import { pinoLogger } from '../lib/logger.ts';

export function computeNextQuestResetDate(
	period: 'DAILY' | 'WEEKLY' | string,
	now: Date = new Date(),
): Date {
	const durationMs = period === 'WEEKLY' ? 7 * 24 * 3_600_000 : 24 * 3_600_000;
	return new Date(now.getTime() + durationMs);
}

export async function runDailyQuestReset(now: Date = new Date()): Promise<{
	resetCount: number;
}> {
	let resetCount = 0;

	try {
		const expiredQuests = await db.select().from(quests).where(lte(quests.resetAt, now)).limit(100);

		for (const q of expiredQuests) {
			const nextReset = computeNextQuestResetDate(q.period, now);
			await db
				.update(quests)
				.set({
					progress: 0,
					claimed: false,
					resetAt: nextReset,
					updatedAt: now,
				})
				.where(eq(quests.id, q.id));
			resetCount++;
		}
	} catch (error) {
		pinoLogger.debug({ err: error }, 'DailyQuestReset cycle skipped');
	}

	return { resetCount };
}
