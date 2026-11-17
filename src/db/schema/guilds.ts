import { boolean, pgTable, real, timestamp, varchar } from 'drizzle-orm/pg-core';

export const guilds = pgTable('guilds', {
	id: varchar('id', { length: 20 }).primaryKey(),
	airingChannelId: varchar('airing_channel_id', { length: 20 }),
	automodEnabled: boolean('automod_enabled').notNull().default(false),
	economyTaxRate: real('economy_tax_rate').notNull().default(0.05),
	xpBoostOverride: real('xp_boost_override').notNull().default(0),
	coinBoostOverride: real('coin_boost_override').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type GuildRow = typeof guilds.$inferSelect;
export type NewGuildRow = typeof guilds.$inferInsert;
