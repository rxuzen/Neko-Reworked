import { boolean, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.ts';

export const userSettings = pgTable('user_settings', {
	userId: varchar('user_id', { length: 20 })
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	titleLanguage: varchar('title_language', { length: 16 }).notNull().default('ROMAJI'),
	timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
	compactMode: boolean('compact_mode').notNull().default(false),
	levelUpAlerts: boolean('level_up_alerts').notNull().default(true),
	airingDmAlerts: boolean('airing_dm_alerts').notNull().default(true),
	expeditionDmAlerts: boolean('expedition_dm_alerts').notNull().default(true),
	loanReminderAlerts: boolean('loan_reminder_alerts').notNull().default(true),
	publicWallet: boolean('public_wallet').notNull().default(true),
	allowTradeRequests: boolean('allow_trade_requests').notNull().default(true),
	allowBorrowRequests: boolean('allow_borrow_requests').notNull().default(true),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserSettingsRow = typeof userSettings.$inferSelect;
export type NewUserSettingsRow = typeof userSettings.$inferInsert;
