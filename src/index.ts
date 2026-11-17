import '@sapphire/plugin-logger/register';
import '@sapphire/plugin-utilities-store/register';
import { BOT_NAME, BOT_VERSION } from './config/constants.ts';
import { env } from './config/env.ts';
import { dispatchCriticalOwnerAlert, registerGlobalErrorHandlers } from './lib/alerts.ts';
import { NekoClient } from './lib/client.ts';
import { pinoLogger } from './lib/logger.ts';

registerGlobalErrorHandlers();

const client = new NekoClient();

async function bootstrap(): Promise<void> {
	try {
		pinoLogger.info(`Starting ${BOT_NAME} v${BOT_VERSION} in ${env.NODE_ENV} mode...`);
		await client.login(env.DISCORD_TOKEN);
	} catch (error) {
		pinoLogger.fatal({ err: error }, `Failed to bootstrap ${BOT_NAME}`);
		await dispatchCriticalOwnerAlert('UNCAUGHT EXCEPTION', error);
		process.exit(1);
	}
}

async function shutdown(signal: string): Promise<void> {
	pinoLogger.info(`Received ${signal}. Shutting down ${BOT_NAME} gracefully...`);
	await client.destroy();
	process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

void bootstrap();
