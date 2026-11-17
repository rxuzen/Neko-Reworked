import { Events, Listener } from '@sapphire/framework';
import type { Client } from 'discord.js';
import { BOT_NAME, BOT_VERSION } from '../config/constants.ts';
import { env } from '../config/env.ts';

export class ReadyListener extends Listener<typeof Events.ClientReady> {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, {
			...options,
			once: true,
			event: Events.ClientReady,
		});
	}

	public override run(client: Client<true>): void {
		const { username, id } = client.user;
		const commandCount = this.container.stores.get('commands').size;
		const handlerCount = this.container.stores.get('interaction-handlers').size;

		this.container.logger.info(
			`${BOT_NAME} v${BOT_VERSION} ready as ${username} (${id}) | Env: ${env.NODE_ENV} | Guilds: ${client.guilds.cache.size} | Commands: ${commandCount} | Handlers: ${handlerCount}`,
		);
	}
}
