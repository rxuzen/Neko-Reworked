import { container } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ContainerBuilder,
	type MessageActionRowComponentBuilder,
	MessageFlags,
	type TextChannel,
} from 'discord.js';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { guilds, userSettings, watchlists } from '../db/schema/index.ts';
import { createNekoContainer } from '../lib/cv2/NekoLayout.ts';
import { discordTime, formatStatus, statusFooter } from '../lib/cv2/TimeAndStatus.ts';
import { pinoLogger } from '../lib/logger.ts';
import { getAiringSchedule } from '../services/anilist.service.ts';
import type { AiringScheduleEntry } from '../services/jikan.service.ts';

export function buildEpisodeAiringAlertContainer(
	entry: AiringScheduleEntry,
	titleMode = 'ROMAJI',
): ContainerBuilder {
	const displayTitle =
		titleMode === 'ENGLISH' && entry.titleEnglish ? entry.titleEnglish : entry.titleRomaji;

	const linkBtn = new ButtonBuilder()
		.setLabel('AniList Page ↗')
		.setStyle(ButtonStyle.Link)
		.setURL(entry.siteUrl);

	const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(linkBtn);

	return createNekoContainer({
		title: `${formatStatus('AIRING')} ${displayTitle} — Episode ${entry.episode}`,
		subtitle: `${entry.format}  |  Broadcast Alert`,
		fields: [
			{
				key: 'NEW EPISODE RELEASED',
				value: `**Episode ${entry.episode}** of **[${displayTitle}](${entry.siteUrl})** aired ${discordTime(entry.airingAtUnix, 'R')} (${discordTime(entry.airingAtUnix, 'f')}).`,
			},
		],
		controls: [row],
		footer: statusFooter('UPDATED', `AniList ID: ${entry.mediaId} • Airing Feed`),
	});
}

export async function runAiringScheduleNotifier(
	nowUnix: number = Math.floor(Date.now() / 1_000),
): Promise<{ userDmCount: number; guildFeedCount: number }> {
	let userDmCount = 0;
	let guildFeedCount = 0;

	try {
		const airingEntries = await getAiringSchedule(nowUnix - 1_800, nowUnix + 300);
		if (airingEntries.length === 0) {
			return { userDmCount: 0, guildFeedCount: 0 };
		}

		const subscribedGuilds = await db
			.select()
			.from(guilds)
			.where(isNotNull(guilds.airingChannelId))
			.limit(50)
			.catch(() => []);

		for (const entry of airingEntries) {
			// 1. Personal User Watchlist DMs
			const watchers = await db
				.select()
				.from(watchlists)
				.where(
					and(
						eq(watchlists.anilistId, entry.mediaId),
						eq(watchlists.notifyOnAir, true),
						lt(watchlists.lastNotifiedEpisode, entry.episode),
					),
				)
				.limit(50)
				.catch(() => []);

			for (const w of watchers) {
				await db
					.update(watchlists)
					.set({ lastNotifiedEpisode: entry.episode })
					.where(eq(watchlists.id, w.id))
					.catch(() => {});

				const settingsRows = await db
					.select()
					.from(userSettings)
					.where(eq(userSettings.userId, w.userId))
					.limit(1)
					.catch(() => []);

				const pref = settingsRows[0];
				if (pref && !pref.airingDmAlerts) continue;

				const user = await container.client?.users.fetch(w.userId).catch(() => null);
				if (user) {
					const card = buildEpisodeAiringAlertContainer(entry, pref?.titleLanguage ?? 'ROMAJI');
					await user
						.send({
							flags: MessageFlags.IsComponentsV2,
							components: [card],
						})
						.catch(() => {});
					userDmCount++;
				}
			}

			// 2. Server-Wide Airing Notification Channels
			const feedCard = buildEpisodeAiringAlertContainer(entry, 'ROMAJI');
			for (const g of subscribedGuilds) {
				if (!g.airingChannelId) continue;
				const chan = (await container.client?.channels
					.fetch(g.airingChannelId)
					.catch(() => null)) as TextChannel | null;
				if (chan && 'send' in chan) {
					await chan
						.send({
							flags: MessageFlags.IsComponentsV2,
							components: [feedCard],
						})
						.catch(() => {});
					guildFeedCount++;
				}
			}
		}
	} catch (error) {
		pinoLogger.debug({ err: error }, 'AiringScheduleNotifier cycle skipped');
	}

	return { userDmCount, guildFeedCount };
}
