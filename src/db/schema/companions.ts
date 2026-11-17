import { integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { gachaCards } from './gacha.ts';
import { users } from './users.ts';

export const companions = pgTable('companions', {
	userId: varchar('user_id', { length: 20 })
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	partnerName: varchar('partner_name', { length: 128 }).notNull().default('Shiro (Neko Familiar)'),
	partnerRarity: varchar('partner_rarity', { length: 8 }).notNull().default('SR'),
	partnerStars: integer('partner_stars').notNull().default(1),
	partnerImageUrl: text('partner_image_url'),
	gachaCardId: integer('gacha_card_id').references(() => gachaCards.id, {
		onDelete: 'set null',
	}),
	bondLevel: integer('bond_level').notNull().default(1),
	affectionXp: integer('affection_xp').notNull().default(0),
	mood: integer('mood').notNull().default(100),
	lastHeadpatAt: timestamp('last_headpat_at', { withTimezone: true }),
	lastFedAt: timestamp('last_fed_at', { withTimezone: true }),
	expeditionZoneId: varchar('expedition_zone_id', { length: 64 }),
	expeditionStartedAt: timestamp('expedition_started_at', { withTimezone: true }),
	expeditionEndsAt: timestamp('expedition_ends_at', { withTimezone: true }),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CompanionRow = typeof companions.$inferSelect;
export type NewCompanionRow = typeof companions.$inferInsert;
