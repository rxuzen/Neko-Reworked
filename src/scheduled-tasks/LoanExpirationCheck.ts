import { container } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { and, eq, lte, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { loans, userSettings, users } from '../db/schema/index.ts';
import { createNekoContainer } from '../lib/cv2/NekoLayout.ts';
import { formatCountdown, formatStatus, statusFooter } from '../lib/cv2/TimeAndStatus.ts';
import { pinoLogger } from '../lib/logger.ts';

export async function runLoanExpirationCheck(now: Date = new Date()): Promise<{
	remindedCount: number;
	defaultedCount: number;
}> {
	let remindedCount = 0;
	let defaultedCount = 0;

	try {
		// 1. Send upcoming due reminders (within 6 hours of dueAt)
		const reminderHorizon = new Date(now.getTime() + 6 * 3_600_000);
		const dueSoonLoans = await db
			.select()
			.from(loans)
			.where(
				and(
					eq(loans.status, 'ACTIVE'),
					eq(loans.reminded, false),
					lte(loans.dueAt, reminderHorizon),
				),
			)
			.limit(25);

		for (const loan of dueSoonLoans) {
			await db.update(loans).set({ reminded: true }).where(eq(loans.id, loan.id));

			const borrowerSettings = await db
				.select()
				.from(userSettings)
				.where(eq(userSettings.userId, loan.borrowerId))
				.limit(1);

			if (borrowerSettings[0]?.loanReminderAlerts !== false) {
				const user = await container.client?.users.fetch(loan.borrowerId).catch(() => null);
				if (user) {
					const card = createNekoContainer({
						title: `${formatStatus('COOLDOWN')} Economy Loan Due Soon`,
						subtitle: `Loan #${loan.id}  |  Repayment: ${loan.repayCoins.toLocaleString()} Coins`,
						fields: [
							{
								key: 'REPAYMENT REMINDER',
								value: `Your loan of **${loan.repayCoins.toLocaleString()} Coins** is due in ${formatCountdown(loan.dueAt, now.getTime())}.\nOpen \`/economy\` -> \`TRANSFER\` and click **[ Repay Loan ]** before it expires.`,
							},
						],
						footer: statusFooter('UPDATED', 'Neko Economy Loan Monitor'),
					});

					await user
						.send({
							flags: MessageFlags.IsComponentsV2,
							components: [card],
						})
						.catch(() => {});
					remindedCount++;
				}
			}
		}

		// 2. Process expired active loans
		const expiredLoans = await db
			.select()
			.from(loans)
			.where(and(eq(loans.status, 'ACTIVE'), lte(loans.dueAt, now)))
			.limit(25);

		for (const loan of expiredLoans) {
			await db.transaction(async (tx) => {
				await tx
					.update(loans)
					.set({ status: 'DEFAULTED', resolvedAt: now })
					.where(eq(loans.id, loan.id));

				await tx
					.update(users)
					.set({
						coins: sql`GREATEST(0, ${users.coins} - ${loan.repayCoins})`,
						updatedAt: now,
					})
					.where(eq(users.id, loan.borrowerId));
			});
			defaultedCount++;
		}
	} catch (error) {
		pinoLogger.debug({ err: error }, 'LoanExpirationCheck cycle skipped');
	}

	return { remindedCount, defaultedCount };
}
