import { Command } from '@sapphire/framework';
import { type ContainerBuilder, MessageFlags } from 'discord.js';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { type WatchlistRow, watchlists } from '../../db/schema/index.ts';
import { encodeCustomId } from '../../lib/cv2/CustomId.ts';
import { type NekoFieldOption, createNekoContainer } from '../../lib/cv2/NekoLayout.ts';
import {
	discordTime,
	formatCountdown,
	formatInTimezone,
	formatStatus,
	statusFooter,
} from '../../lib/cv2/TimeAndStatus.ts';
import { getAiringSchedule } from '../../services/anilist.service.ts';
import type { AiringScheduleEntry } from '../../services/jikan.service.ts';
import { resolvePreferredTitle } from './anime.ts';

export type ScheduleCardTab = 'today' | 'upcoming' | 'watchlist';

export const SCHEDULE_DAYS = [
	'today',
	'upcoming',
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday',
	'sunday',
] as const;

export async function fetchUserWatchlist(userId: string): Promise<WatchlistRow[]> {
	try {
		return await db.select().from(watchlists).where(eq(watchlists.userId, userId)).limit(20);
	} catch {
		return [];
	}
}

export interface BuildScheduleCardOptions {
	ownerId: string;
	tab: ScheduleCardTab;
	entries: readonly AiringScheduleEntry[];
	watchlistItems: readonly WatchlistRow[];
	timezone: string;
	titleMode: string;
	createdAtMs?: number;
}

export function buildScheduleCardContainer(options: BuildScheduleCardOptions): ContainerBuilder {
	const createdAtMs = options.createdAtMs ?? Date.now();
	const { ownerId, tab, entries, watchlistItems, timezone, titleMode } = options;

	const tabDefs: Array<{ key: ScheduleCardTab; label: string }> = [
		{ key: 'today', label: 'TODAY' },
		{ key: 'upcoming', label: 'UPCOMING' },
		{ key: 'watchlist', label: 'MY WATCHLIST' },
	];

	const tabs = tabDefs.map((t) => ({
		customId: encodeCustomId({
			domain: 'sch',
			action: 'tab',
			ownerId,
			state: t.key,
			extra: timezone,
			createdAtMs,
		}),
		label: t.label,
		active: tab === t.key,
	}));

	const fields: NekoFieldOption[] = [];

	if (tab === 'watchlist') {
		if (watchlistItems.length === 0) {
			fields.push({
				key: 'TRACKED AIRING ANIME',
				value:
					'Your watchlist is currently empty. Use **`/anime <query>`** and click **[ + Add to Watchlist ]** to track airing shows and receive automated episode alerts.',
			});
		} else {
			const lines = watchlistItems.slice(0, 12).map((item) => {
				const title = resolvePreferredTitle(item.titleRomaji, item.titleEnglish, titleMode);
				const alertBadge = item.notifyOnAir ? '`[ DM Alerts ON ]`' : '`[ Muted ]`';
				const upcomingMatch = entries.find((e) => e.mediaId === item.anilistId);
				const nextEpStr = upcomingMatch
					? ` — **Ep ${upcomingMatch.episode}** in ${formatCountdown(upcomingMatch.airingAtUnix)}`
					: '';
				return `• **[${title}](https://anilist.co/anime/${item.anilistId})** ${alertBadge}${nextEpStr}`;
			});

			fields.push({
				key: `MY WATCHLIST (${watchlistItems.length} TRACKED)`,
				value: lines.join('\n'),
			});
		}
	} else {
		const headerKey =
			tab === 'today'
				? `TODAY'S BROADCAST SCHEDULE (${timezone})`
				: `UPCOMING 72-HOUR BROADCASTS (${timezone})`;

		if (entries.length === 0) {
			fields.push({
				key: headerKey,
				value: 'No anime broadcasts scheduled in this window.',
			});
		} else {
			const lines = entries.slice(0, 10).map((entry) => {
				const title = resolvePreferredTitle(entry.titleRomaji, entry.titleEnglish, titleMode);
				const localTime = formatInTimezone(entry.airingAtUnix, timezone, 'ddd h:mm A');
				return `• **[${title}](${entry.siteUrl})** — **Ep ${entry.episode}** airs ${discordTime(entry.airingAtUnix, 'R')} (\`${localTime}\`)`;
			});

			fields.push({
				key: headerKey,
				value: lines.join('\n'),
			});
		}
	}

	return createNekoContainer({
		title: 'Anime Broadcast Schedule',
		subtitle: `${formatStatus('AIRING')}  |  Timezone: ${timezone}  |  Title Mode: ${titleMode}`,
		tabs,
		fields,
		footer: statusFooter('UPDATED', `Schedule synced for ${timezone}`),
	});
}

export class ScheduleCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'schedule',
			description: 'View airing anime broadcast schedules adjusted to your personal timezone.',
			cooldownDelay: 2_000,
		});
	}

	public override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.addStringOption((opt) =>
					opt
						.setName('day')
						.setDescription('View today, upcoming, or your personal watchlist')
						.setRequired(false)
						.setAutocomplete(true),
				),
		);
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		const rawDay = (interaction.options.getString('day') ?? 'today').toLowerCase();
		const ctx = await this.container.context.getUserContext(interaction.user.id);

		const tab: ScheduleCardTab =
			rawDay === 'watchlist' ? 'watchlist' : rawDay === 'upcoming' ? 'upcoming' : 'today';

		const nowUnix = Math.floor(Date.now() / 1_000);
		const windowSeconds = tab === 'today' ? 86_400 : 3 * 86_400;

		const [entries, watchlistItems] = await Promise.all([
			getAiringSchedule(nowUnix - 3_600, nowUnix + windowSeconds),
			fetchUserWatchlist(interaction.user.id),
		]);

		const container = buildScheduleCardContainer({
			ownerId: interaction.user.id,
			tab,
			entries,
			watchlistItems,
			timezone: ctx.settings.timezone,
			titleMode: ctx.settings.titleLanguage,
		});

		await interaction.reply({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
		});
	}
}
