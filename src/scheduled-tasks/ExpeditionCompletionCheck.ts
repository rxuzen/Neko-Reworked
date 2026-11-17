import { container } from '@sapphire/framework';
import { type ContainerBuilder, MessageFlags } from 'discord.js';
import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { companions, userSettings } from '../db/schema/index.ts';
import { EXPEDITION_ZONES } from '../db/seed.ts';
import { createNekoContainer } from '../lib/cv2/NekoLayout.ts';
import { formatStatus, statusFooter } from '../lib/cv2/TimeAndStatus.ts';
import { pinoLogger } from '../lib/logger.ts';
import { checkAndSetCooldown } from '../lib/redis.ts';

export function buildExpeditionCompleteAlertContainer(
	partnerName: string,
	zoneName: string,
): ContainerBuilder {
	return createNekoContainer({
		title: `${formatStatus('CONFIRMED')} Neko Expedition Complete!`,
		subtitle: `Partner: ${partnerName}  |  Zone: ${zoneName}`,
		fields: [
			{
				key: 'OUTING RETURN REPORT',
				value: `**${partnerName}** has returned from exploring **${zoneName}** with a pouch full of Gacha Shards!\nOpen \`/profile\` -> \`COMPANION\` and click **[ Claim Expedition ]** to collect your rewards.`,
			},
		],
		footer: statusFooter('UPDATED', 'Neko Companion Outing Notifier'),
	});
}

export async function runExpeditionCompletionCheck(
	now: Date = new Date(),
): Promise<{ notifiedCount: number }> {
	let notifiedCount = 0;

	try {
		const completedRows = await db
			.select()
			.from(companions)
			.where(
				and(
					isNotNull(companions.expeditionZoneId),
					isNotNull(companions.expeditionEndsAt),
					lte(companions.expeditionEndsAt, now),
				),
			)
			.limit(30);

		for (const comp of completedRows) {
			const dedupeKey = `exp_dm:${comp.userId}:${comp.expeditionEndsAt?.getTime() ?? 0}`;
			const cd = await checkAndSetCooldown(dedupeKey, 24 * 3_600_000);
			if (cd.onCooldown) continue;

			const settingsRows = await db
				.select()
				.from(userSettings)
				.where(eq(userSettings.userId, comp.userId))
				.limit(1)
				.catch(() => []);

			if (settingsRows[0]?.expeditionDmAlerts === false) continue;

			const zone =
				EXPEDITION_ZONES.find((z) => z.id === comp.expeditionZoneId) ?? EXPEDITION_ZONES[0]!;
			const user = await container.client?.users.fetch(comp.userId).catch(() => null);
			if (user) {
				const card = buildExpeditionCompleteAlertContainer(comp.partnerName, zone.name);
				await user
					.send({
						flags: MessageFlags.IsComponentsV2,
						components: [card],
					})
					.catch(() => {});
				notifiedCount++;
			}
		}
	} catch (error) {
		pinoLogger.debug({ err: error }, 'ExpeditionCompletionCheck cycle skipped');
	}

	return { notifiedCount };
}
