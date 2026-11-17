import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import ms from 'ms';

dayjs.extend(utc);
dayjs.extend(timezone);

export type NekoStatusTag =
	| 'AIRING'
	| 'UPCOMING'
	| 'FINISHED'
	| 'UPDATED'
	| 'CONFIRMED'
	| 'APPROVED'
	| 'CANCELLED'
	| 'EXPIRED'
	| 'COOLDOWN'
	| 'ACCESS DENIED'
	| 'ERROR'
	| 'CRITICAL'
	| 'WISHLISTED'
	| 'ASCENDED'
	| 'EXPEDITION'
	| 'BLESSED'
	| 'CURSED'
	| 'OWNED'
	| 'UNOWNED';

export type DiscordTimestampStyle = 't' | 'T' | 'd' | 'D' | 'f' | 'F' | 'R';

export function toUnixSeconds(input: Date | number | dayjs.Dayjs): number {
	if (typeof input === 'number') {
		return input > 10_000_000_000 ? Math.floor(input / 1_000) : Math.floor(input);
	}
	if (input instanceof Date) {
		return Math.floor(input.getTime() / 1_000);
	}
	return input.unix();
}

export function formatStatus(tag: NekoStatusTag | string): string {
	const cleaned = tag
		.trim()
		.replace(/^\[|\]$/g, '')
		.trim()
		.toUpperCase();
	return `[ ${cleaned} ]`;
}

export function discordTime(
	dateOrUnix: Date | number | dayjs.Dayjs,
	style: DiscordTimestampStyle = 'R',
): string {
	const unix = toUnixSeconds(dateOrUnix);
	return `<t:${unix}:${style}>`;
}

export function formatDurationCompact(durationMs: number): string {
	if (durationMs <= 0) return '0s';

	const totalSeconds = Math.floor(durationMs / 1_000);
	const days = Math.floor(totalSeconds / 86_400);
	const hours = Math.floor((totalSeconds % 86_400) / 3_600);
	const minutes = Math.floor((totalSeconds % 3_600) / 60);
	const seconds = totalSeconds % 60;

	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0 && days === 0) parts.push(`${minutes}m`);
	if (seconds > 0 && days === 0 && hours === 0) parts.push(`${seconds}s`);

	return parts.length > 0 ? parts.slice(0, 2).join(' ') : ms(durationMs);
}

export function formatCountdown(
	targetDateOrUnix: Date | number | dayjs.Dayjs,
	nowMs: number = Date.now(),
): string {
	const targetUnix = toUnixSeconds(targetDateOrUnix);
	const targetMs = targetUnix * 1_000;
	const diffMs = targetMs - nowMs;

	if (diffMs <= 0) {
		return `${formatStatus('EXPIRED')} (${discordTime(targetUnix, 'R')})`;
	}

	const humanRemaining = formatDurationCompact(diffMs);
	return `**${humanRemaining}** (${discordTime(targetUnix, 'R')})`;
}

export function statusFooter(
	tag: NekoStatusTag | string,
	message: string,
	dateOrUnix: Date | number | dayjs.Dayjs = Date.now(),
): string {
	return `${formatStatus(tag)} ${message} ${discordTime(dateOrUnix, 'R')}`;
}

export function formatInTimezone(
	dateOrUnix: Date | number | dayjs.Dayjs,
	tz = 'UTC',
	pattern = 'ddd, MMM D • h:mm A',
): string {
	const unixSeconds = toUnixSeconds(dateOrUnix);
	try {
		return dayjs.unix(unixSeconds).tz(tz).format(pattern);
	} catch {
		return dayjs.unix(unixSeconds).utc().format(pattern);
	}
}
