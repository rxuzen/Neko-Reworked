import {
	boolean,
	index,
	integer,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users.ts';

export const gachaCards = pgTable(
	'gacha_cards',
	{
		id: serial('id').primaryKey(),
		userId: varchar('user_id', { length: 20 })
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		banner: varchar('banner', { length: 16 }).notNull(),
		externalId: integer('external_id').notNull(),
		name: varchar('name', { length: 128 }).notNull(),
		seriesOrType: varchar('series_or_type', { length: 128 }).notNull(),
		rarity: varchar('rarity', { length: 8 }).notNull(),
		stars: integer('stars').notNull().default(1),
		duplicates: integer('duplicates').notNull().default(0),
		imageUrl: text('image_url').notNull(),
		altImageUrl: text('alt_image_url'),
		isFavorite: boolean('is_favorite').notNull().default(false),
		obtainedAt: timestamp('obtained_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex('gacha_cards_user_banner_ext_idx').on(table.userId, table.banner, table.externalId),
		index('gacha_cards_external_idx').on(table.banner, table.externalId),
	],
);

export const gachaPity = pgTable(
	'gacha_pity',
	{
		userId: varchar('user_id', { length: 20 })
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		banner: varchar('banner', { length: 16 }).notNull(),
		pullsSinceSsr: integer('pulls_since_ssr').notNull().default(0),
		totalPulls: integer('total_pulls').notNull().default(0),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.banner] })],
);

export const gachaWishlists = pgTable(
	'gacha_wishlists',
	{
		id: serial('id').primaryKey(),
		userId: varchar('user_id', { length: 20 })
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		banner: varchar('banner', { length: 16 }).notNull(),
		slot: integer('slot').notNull(),
		externalId: integer('external_id').notNull(),
		name: varchar('name', { length: 128 }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex('gacha_wishlists_user_banner_slot_idx').on(table.userId, table.banner, table.slot),
	],
);

export type GachaCardRow = typeof gachaCards.$inferSelect;
export type NewGachaCardRow = typeof gachaCards.$inferInsert;
export type GachaPityRow = typeof gachaPity.$inferSelect;
export type GachaWishlistRow = typeof gachaWishlists.$inferSelect;
