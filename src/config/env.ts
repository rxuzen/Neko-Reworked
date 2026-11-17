import 'dotenv/config';
import { z } from 'zod';

const snowflakeRegex = /^\d{17,20}$/;

export const envSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
	DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
	DISCORD_APPLICATION_ID: z.string().regex(snowflakeRegex).optional(),
	DATABASE_URL: z
		.string()
		.url('DATABASE_URL must be a valid PostgreSQL connection URL')
		.refine(
			(val) => val.startsWith('postgres://') || val.startsWith('postgresql://'),
			'DATABASE_URL must start with postgres:// or postgresql://',
		),
	REDIS_URL: z
		.string()
		.url('REDIS_URL must be a valid Redis connection URL')
		.refine(
			(val) => val.startsWith('redis://') || val.startsWith('rediss://'),
			'REDIS_URL must start with redis:// or rediss://',
		),
	SAUCENAO_API_KEY: z.string().default(''),
	OWNER_IDS: z
		.string()
		.default('')
		.transform((val) =>
			val
				.split(',')
				.map((id) => id.trim())
				.filter((id) => snowflakeRegex.test(id)),
		),
	CRITICAL_ALERT_WEBHOOK_URL: z
		.string()
		.optional()
		.transform((val) => (val && val.trim().length > 0 ? val.trim() : undefined))
		.pipe(z.string().url().optional()),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: NodeJS.ProcessEnv = process.env): Env {
	const isTest = rawEnv.NODE_ENV === 'test';
	const input: NodeJS.ProcessEnv = isTest
		? {
				DISCORD_TOKEN: 'test_discord_token_placeholder',
				DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/neko_test',
				REDIS_URL: 'redis://localhost:6379',
				...rawEnv,
			}
		: rawEnv;

	const parsed = envSchema.safeParse(input);
	if (!parsed.success) {
		const formatted = parsed.error.issues
			.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
			.join('\n');
		throw new Error(`[Neko Env Validation Failed]\n${formatted}`);
	}
	return parsed.data;
}

export const env: Env = parseEnv();
