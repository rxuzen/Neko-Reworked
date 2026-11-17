import { integer, pgTable, serial, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.ts';

export const inventory = pgTable(
	'inventory',
	{
		id: serial('id').primaryKey(),
		userId: varchar('user_id', { length: 20 })
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		itemId: varchar('item_id', { length: 64 }).notNull(),
		category: varchar('category', { length: 32 }).notNull(),
		quantity: integer('quantity').notNull().default(1),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [uniqueIndex('inventory_user_item_idx').on(table.userId, table.itemId)],
);

export type InventoryRow = typeof inventory.$inferSelect;
export type NewInventoryRow = typeof inventory.$inferInsert;
