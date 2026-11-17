import { describe, expect, it } from 'bun:test';
import { LogLevel } from '@sapphire/framework';
import { CV2_LIMITS } from '../config/constants.ts';
import { envSchema } from '../config/env.ts';
import { buildCriticalAlertContainer } from '../lib/alerts.ts';
import { NekoClient } from '../lib/client.ts';
import { NekoSapphireLogger } from '../lib/logger.ts';

describe('Phase 1: Project Foundation & Runtime Setup', () => {
	it('validates environment variables and parses OWNER_IDS snowflakes cleanly', () => {
		const parsed = envSchema.parse({
			NODE_ENV: 'development',
			LOG_LEVEL: 'debug',
			DISCORD_TOKEN: 'mock_token',
			DATABASE_URL: 'postgresql://user:pass@localhost:5432/neko',
			REDIS_URL: 'redis://localhost:6379',
			SAUCENAO_API_KEY: 'sauce_key',
			OWNER_IDS: '123456789012345678, invalid_id, 987654321098765432',
		});

		expect(parsed.OWNER_IDS).toEqual(['123456789012345678', '987654321098765432']);
		expect(parsed.CRITICAL_ALERT_WEBHOOK_URL).toBeUndefined();
	});

	it('rejects non-postgres DATABASE_URL and non-redis REDIS_URL', () => {
		const result = envSchema.safeParse({
			DISCORD_TOKEN: 'mock_token',
			DATABASE_URL: 'http://localhost:5432/neko',
			REDIS_URL: 'http://localhost:6379',
		});

		expect(result.success).toBe(false);
	});

	it('builds a colorless CV2 [ CRITICAL ] container within character budget', () => {
		const hugeError = new Error('Database connection lost');
		hugeError.stack = `Error: Database connection lost\n${'    at Object.<anonymous> (/src/index.ts:1:1)\n'.repeat(150)}`;

		const container = buildCriticalAlertContainer('UNHANDLED REJECTION', hugeError);
		const json = container.toJSON();

		expect(json.accent_color).toBeUndefined();
		const serialized = JSON.stringify(json);
		expect(serialized).toContain('[ CRITICAL ] Runtime Exception');
		expect(serialized).toContain('UNHANDLED REJECTION');
		expect(serialized).toContain('... [truncated]');
		expect(serialized.length).toBeLessThanOrEqual(CV2_LIMITS.MAX_CHARACTERS);
	});

	it('instantiates NekoSapphireLogger and respects log levels', () => {
		const logger = new NekoSapphireLogger(LogLevel.Info);
		expect(logger.has(LogLevel.Info)).toBe(true);
		expect(logger.has(LogLevel.Debug)).toBe(false);
	});

	it('configures NekoClient with sweepers and Sapphire logger', async () => {
		const client = new NekoClient();
		expect(client.options.defaultPrefix).toBeNull();
		expect(client.options.sweepers?.messages).toEqual({
			interval: 300,
			lifetime: 300,
		});
		await client.destroy();
	});
});
