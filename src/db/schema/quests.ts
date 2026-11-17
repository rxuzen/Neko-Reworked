import {
	boolean,
	integer,
	pgTable,
	serial,
	timestamp,
	uniqueIndex,
	varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users.ts';

export const quests = pgTable(
	'quests',
	{
		id: serial('id').primaryKey(),
		userId: varchar('user_id', { length: 20 })
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		questKey: varchar('quest_key', { length: 64 }).notNull(),
		period: varchar('period', { length: 16 }).notNull().default('DAILY'),
		progress: integer('progress').notNull().default(0),
		target: integer('target').notNull(),
		claimed: boolean('claimed').notNull().default(false),
		resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex('quests_user_key_period_idx').on(table.userId, table.questKey, table.period),
	],
);

export type QuestRow = typeof quests.$inferSelect;
export type NewQuestRow = typeof quests.$inferInsert;
