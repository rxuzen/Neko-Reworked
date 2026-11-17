import { bigint, integer, pgTable, real, timestamp, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	id: varchar('id', { length: 20 }).primaryKey(),
	xp: bigint('xp', { mode: 'number' }).notNull().default(0),
	level: integer('level').notNull().default(1),
	coins: bigint('coins', { mode: 'number' }).notNull().default(0),
	vaultCoins: bigint('vault_coins', { mode: 'number' }).notNull().default(0),
	vaultCapacity: bigint('vault_capacity', { mode: 'number' }).notNull().default(5_000),
	gems: integer('gems').notNull().default(0),
	shards: integer('shards').notNull().default(0),
	starShards: integer('star_shards').notNull().default(0),
	careerId: varchar('career_id', { length: 64 }).notNull().default('konbini_clerk'),
	careerXp: integer('career_xp').notNull().default(0),
	careerLevel: integer('career_level').notNull().default(1),
	equippedTitle: varchar('equipped_title', { length: 100 })
		.notNull()
		.default('[ NEKO ] Stray Kitten'),
	bio: varchar('bio', { length: 300 }).notNull().default('A wandering Neko adventurer.'),
	xpMultiplierPerm: real('xp_multiplier_perm').notNull().default(0),
	coinMultiplierPerm: real('coin_multiplier_perm').notNull().default(0),
	shrineStreak: integer('shrine_streak').notNull().default(0),
	lastShrineCheckinAt: timestamp('last_shrine_checkin_at', { withTimezone: true }),
	omikujiFortune: varchar('omikuji_fortune', { length: 32 }),
	omikujiExpiresAt: timestamp('omikuji_expires_at', { withTimezone: true }),
	matsuriPoints: integer('matsuri_points').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
