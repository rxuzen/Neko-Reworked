import { bigint, boolean, index, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.ts';

export const loans = pgTable(
	'loans',
	{
		id: serial('id').primaryKey(),
		lenderId: varchar('lender_id', { length: 20 })
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		borrowerId: varchar('borrower_id', { length: 20 })
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		principalCoins: bigint('principal_coins', { mode: 'number' }).notNull(),
		repayCoins: bigint('repay_coins', { mode: 'number' }).notNull(),
		status: varchar('status', { length: 16 }).notNull().default('ACTIVE'),
		dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
		reminded: boolean('reminded').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		resolvedAt: timestamp('resolved_at', { withTimezone: true }),
	},
	(table) => [
		index('loans_borrower_status_idx').on(table.borrowerId, table.status),
		index('loans_due_status_idx').on(table.dueAt, table.status),
	],
);

export type LoanRow = typeof loans.$inferSelect;
export type NewLoanRow = typeof loans.$inferInsert;
