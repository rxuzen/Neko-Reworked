import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LogLevel, SapphireClient } from '@sapphire/framework';
import { GatewayIntentBits, Options, Partials } from 'discord.js';
import { env } from '../config/env.ts';
import { NekoSapphireLogger } from './logger.ts';

const currentDir = dirname(fileURLToPath(import.meta.url));
const rootSrcDir = join(currentDir, '..');

export class NekoClient extends SapphireClient {
	public constructor() {
		const isDev = env.NODE_ENV === 'development';
		const logLevel = isDev ? LogLevel.Debug : LogLevel.Info;

		super({
			baseUserDirectory: rootSrcDir,
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.MessageContent,
				GatewayIntentBits.DirectMessages,
			],
			partials: [Partials.Channel],
			loadMessageCommandListeners: false,
			defaultPrefix: null,
			logger: {
				level: logLevel,
				instance: new NekoSapphireLogger(logLevel),
			},
			makeCache: Options.cacheWithLimits({
				ReactionManager: 0,
				PresenceManager: 0,
				GuildEmojiManager: 0,
				GuildStickerManager: 0,
				VoiceStateManager: 0,
				StageInstanceManager: 0,
				MessageManager: 25,
			}),
			sweepers: {
				...Options.DefaultSweeperSettings,
				messages: {
					interval: 300,
					lifetime: 300,
				},
			},
		});
	}
}
