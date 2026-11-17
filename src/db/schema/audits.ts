import { index, jsonb, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const audits = pgTable(
	'audits',
	{
		id: serial('id').primaryKey(),
		guildId: varchar('guild_id', { length: 20 }),
		actorId: varchar('actor_id', { length: 20 }).notNull(),
		targetId: varchar('target_id', { length: 20 }),
		category: varchar('category', { length: 32 }).notNull(),
		action: varchar('action', { length: 64 }).notNull(),
		reason: text('reason'),
		metadata: jsonb('metadata').$type<Record<string, unknown>>(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index('audits_guild_idx').on(table.guildId),
		index('audits_actor_idx').on(table.actorId),
	],
);

export type AuditRow = typeof audits.$inferSelect;
export type NewAuditRow = typeof audits.$inferInsert;
