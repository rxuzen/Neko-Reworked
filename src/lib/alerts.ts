import { stripIndents } from 'common-tags';
import {
	ContainerBuilder,
	MessageFlags,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	WebhookClient,
} from 'discord.js';
import { BOT_NAME, BOT_VERSION, CV2_LIMITS } from '../config/constants.ts';
import { env } from '../config/env.ts';
import { pinoLogger } from './logger.ts';

function formatErrorStack(error: unknown): { name: string; message: string; stack: string } {
	if (error instanceof Error) {
		return {
			name: error.name || 'Error',
			message: error.message || 'Unknown error message',
			stack: error.stack ?? `${error.name}: ${error.message}`,
		};
	}
	const fallback = typeof error === 'string' ? error : JSON.stringify(error, null, 2);
	return {
		name: 'NonErrorRejection',
		message: fallback,
		stack: fallback,
	};
}

export function buildCriticalAlertContainer(
	source: 'UNHANDLED REJECTION' | 'UNCAUGHT EXCEPTION',
	error: unknown,
): ContainerBuilder {
	const { name, message, stack } = formatErrorStack(error);
	const unixSeconds = Math.floor(Date.now() / 1_000);
	const maxStackChars = CV2_LIMITS.SAFE_CHARACTER_CAP - 600;
	const safeStack =
		stack.length > maxStackChars ? `${stack.slice(0, maxStackChars)}\n... [truncated]` : stack;

	const header = new TextDisplayBuilder().setContent(
		stripIndents`
			### [ CRITICAL ] Runtime Exception
			-# ${BOT_NAME} v${BOT_VERSION}  |  ${source}  |  Env: ${env.NODE_ENV}
		`,
	);

	const summaryField = new TextDisplayBuilder().setContent(
		stripIndents`
			-# **EXCEPTION SUMMARY**
			**Type:** \`${name}\`
			**Message:** ${message.slice(0, 300)}
			**Occurred:** <t:${unixSeconds}:F> (<t:${unixSeconds}:R>)
		`,
	);

	const stackField = new TextDisplayBuilder().setContent(
		`-# **STACK TRACE**\n\`\`\`text\n${safeStack}\n\`\`\``,
	);

	const footer = new TextDisplayBuilder().setContent(
		`-# [ CRITICAL ] Reported by ${BOT_NAME} Process Monitor  |  PID: ${process.pid}`,
	);

	return new ContainerBuilder()
		.addTextDisplayComponents(header)
		.addSeparatorComponents(
			new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
		)
		.addTextDisplayComponents(summaryField, stackField)
		.addSeparatorComponents(
			new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
		)
		.addTextDisplayComponents(footer);
}

export async function dispatchCriticalOwnerAlert(
	source: 'UNHANDLED REJECTION' | 'UNCAUGHT EXCEPTION',
	error: unknown,
): Promise<void> {
	if (!env.CRITICAL_ALERT_WEBHOOK_URL) {
		return;
	}

	try {
		const webhook = new WebhookClient({ url: env.CRITICAL_ALERT_WEBHOOK_URL });
		const container = buildCriticalAlertContainer(source, error);

		await webhook.send({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
		});
		webhook.destroy();
	} catch (webhookError) {
		pinoLogger.error(
			{ err: webhookError },
			'Failed to dispatch [ CRITICAL ] CV2 owner webhook alert',
		);
	}
}

let handlersRegistered = false;

export function registerGlobalErrorHandlers(): void {
	if (handlersRegistered) return;
	handlersRegistered = true;

	process.on('unhandledRejection', (reason) => {
		pinoLogger.error({ err: reason }, '[CRITICAL] Unhandled Promise Rejection');
		void dispatchCriticalOwnerAlert('UNHANDLED REJECTION', reason);
	});

	process.on('uncaughtException', (error) => {
		pinoLogger.fatal({ err: error }, '[CRITICAL] Uncaught Exception');
		void dispatchCriticalOwnerAlert('UNCAUGHT EXCEPTION', error);
	});
}
