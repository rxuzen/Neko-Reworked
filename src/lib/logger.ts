import { type ILogger, LogLevel } from '@sapphire/framework';
import chalk from 'chalk';
import pino, { type Logger as PinoInstance } from 'pino';
import { BOT_NAME } from '../config/constants.ts';
import { env } from '../config/env.ts';

const isDev = env.NODE_ENV === 'development';

export const pinoLogger: PinoInstance = pino({
	name: BOT_NAME,
	level: env.LOG_LEVEL,
	...(isDev
		? {
				transport: {
					target: 'pino-pretty',
					options: {
						colorize: true,
						translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
						ignore: 'pid,hostname',
					},
				},
			}
		: {}),
});

const sapphireToPinoLevel: Record<LogLevel, pino.LevelWithSilent> = {
	[LogLevel.Trace]: 'trace',
	[LogLevel.Debug]: 'debug',
	[LogLevel.Info]: 'info',
	[LogLevel.Warn]: 'warn',
	[LogLevel.Error]: 'error',
	[LogLevel.Fatal]: 'fatal',
	[LogLevel.None]: 'silent',
};

const levelBadges: Record<LogLevel, string> = {
	[LogLevel.Trace]: chalk.gray('[TRACE]'),
	[LogLevel.Debug]: chalk.cyan('[DEBUG]'),
	[LogLevel.Info]: chalk.green('[INFO]'),
	[LogLevel.Warn]: chalk.yellow('[WARN]'),
	[LogLevel.Error]: chalk.red('[ERROR]'),
	[LogLevel.Fatal]: chalk.bgRed.white.bold('[FATAL]'),
	[LogLevel.None]: '',
};

export class NekoSapphireLogger implements ILogger {
	public readonly level: LogLevel;

	public constructor(level: LogLevel = isDev ? LogLevel.Debug : LogLevel.Info) {
		this.level = level;
	}

	public has(level: LogLevel): boolean {
		return level >= this.level;
	}

	public trace(...values: readonly unknown[]): void {
		this.write(LogLevel.Trace, ...values);
	}

	public debug(...values: readonly unknown[]): void {
		this.write(LogLevel.Debug, ...values);
	}

	public info(...values: readonly unknown[]): void {
		this.write(LogLevel.Info, ...values);
	}

	public warn(...values: readonly unknown[]): void {
		this.write(LogLevel.Warn, ...values);
	}

	public error(...values: readonly unknown[]): void {
		this.write(LogLevel.Error, ...values);
	}

	public fatal(...values: readonly unknown[]): void {
		this.write(LogLevel.Fatal, ...values);
	}

	public write(level: LogLevel, ...values: readonly unknown[]): void {
		if (!this.has(level)) return;

		const pinoMethod = sapphireToPinoLevel[level];
		if (pinoMethod === 'silent') return;

		const badge = isDev ? `${levelBadges[level]} ` : '';
		const first = values[0];

		if (first instanceof Error) {
			pinoLogger[pinoMethod]({ err: first, extra: values.slice(1) }, `${badge}${first.message}`);
			return;
		}

		const message = values
			.map((item) => {
				if (typeof item === 'string') return item;
				if (item instanceof Error) return item.stack ?? item.message;
				try {
					return JSON.stringify(item);
				} catch {
					return String(item);
				}
			})
			.join(' ');

		pinoLogger[pinoMethod](`${badge}${message}`);
	}
}
