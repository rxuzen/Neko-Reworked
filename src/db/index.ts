import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.ts';
import * as schema from './schema/index.ts';

const isTest = env.NODE_ENV === 'test';

export const queryClient = postgres(env.DATABASE_URL, {
	max: isTest ? 2 : 10,
	idle_timeout: 20,
	connect_timeout: 10,
	prepare: true,
});

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
export { schema };
