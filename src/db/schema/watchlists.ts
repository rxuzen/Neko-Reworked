import {
	boolean,
	index,
	integer,
	pgTable,
	serial,
	timestamp,
	uniqueIndex,
	varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users.ts';

export const watchlists = pgTable(
	'watchlists',
	{
		id: serial('id').primaryKey(),
		userId: varchar('user_id', { length: 20 })
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		guildId: varchar('guild_id', { length: 20 }),
		anilistId: integer('anilist_id').notNull(),
		titleRomaji: varchar('title_romaji', { length: 256 }).notNull(),
		titleEnglish: varchar('title_english', { length: 256 }),
		notifyOnAir: boolean('notify_on_air').notNull().default(true),
		lastNotifiedEpisode: integer('last_notified_episode').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex('watchlists_user_anime_idx').on(table.userId, table.anilistId),
		index('watchlists_anilist_idx').on(table.anilistId),
	],
);

export type WatchlistRow = typeof watchlists.$inferSelect;
export type NewWatchlistRow = typeof watchlists.$inferInsert;
