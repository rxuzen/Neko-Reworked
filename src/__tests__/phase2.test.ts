import { describe, expect, it } from 'bun:test';
import { CV2_LIMITS } from '../config/constants.ts';
import { decodeCustomId, encodeCustomId, validateInteractionAccess } from '../lib/cv2/CustomId.ts';
import {
	formatAlignedRows,
	formatProgressBar,
	formatStarRating,
	sanitizeAnimeText,
} from '../lib/cv2/Formatters.ts';
import { createNekoContainer } from '../lib/cv2/NekoLayout.ts';
import { buildConfirmPrompt, buildNotificationContainer } from '../lib/cv2/Notifications.ts';
import {
	discordTime,
	formatCountdown,
	formatStatus,
	statusFooter,
} from '../lib/cv2/TimeAndStatus.ts';

describe('Phase 2: Components V2 (CV2) UI Kit', () => {
	it('formats status tags, Discord timestamps, and countdowns accurately', () => {
		expect(formatStatus('airing')).toBe('[ AIRING ]');
		expect(formatStatus('WISHLISTED')).toBe('[ WISHLISTED ]');
		expect(formatStatus('ASCENDED')).toBe('[ ASCENDED ]');
		expect(formatStatus('EXPEDITION')).toBe('[ EXPEDITION ]');
		expect(formatStatus('BLESSED')).toBe('[ BLESSED ]');
		expect(formatStatus('CURSED')).toBe('[ CURSED ]');

		expect(discordTime(1_795_086_000, 'R')).toBe('<t:1795086000:R>');
		expect(discordTime(1_795_086_000_000, 'f')).toBe('<t:1795086000:f>');

		const nowMs = 1_795_000_000_000;
		const futureUnix = 1_795_086_400; // +24h
		expect(formatCountdown(futureUnix, nowMs)).toBe('**1d** (<t:1795086400:R>)');
		expect(formatCountdown(1_794_900_000, nowMs)).toBe('[ EXPIRED ] (<t:1794900000:R>)');
		expect(statusFooter('UPDATED', 'Synced', 1_795_000_000)).toBe(
			'[ UPDATED ] Synced <t:1795000000:R>',
		);
	});

	it('formats aligned rows, progress bars, and star ratings', () => {
		const aligned = formatAlignedRows([
			{ label: 'Partner', value: 'Momo Ayase' },
			{ label: 'Bond Level', value: '14 / 25' },
		]);
		expect(aligned).toBe('Partner    : Momo Ayase\nBond Level : 14 / 25');
		expect(formatProgressBar(50, 100, 10)).toBe('[█████░░░░░]');
		expect(formatStarRating(3, 5)).toBe('★★★☆☆');
	});

	it('sanitizes AniList/MAL spoilers, strips HTML, and closes unclosed spoilers on truncation', () => {
		const raw =
			'High school girl <i>Momo Ayase</i>.<br><br>She awakens ~!psychokinetic powers after abduction!~ and [spoiler]saves Ken[/spoiler]. (Source: AniList)';
		const sanitized = sanitizeAnimeText(raw, 500);
		expect(sanitized).toBe(
			'High school girl *Momo Ayase*.\n\nShe awakens ||psychokinetic powers after abduction|| and ||saves Ken||.',
		);

		// Truncation inside a spoiler block should cleanly close '||' before '...'
		const truncatedSpoiler = sanitizeAnimeText(
			'Intro text ~!this is a very long secret spoiler that gets cut off midway!~',
			35,
		);
		expect(truncatedSpoiler.endsWith('||...')).toBe(true);
		const pipePairs = truncatedSpoiler.match(/\|\|/g) ?? [];
		expect(pipePairs.length % 2).toBe(0);
	});

	it('encodes, decodes, and enforces ownership & 14-minute expiry on CustomIds', () => {
		const createdAtMs = 1_795_000_000_000;
		const customId = encodeCustomId({
			domain: 'ani',
			action: 'tab',
			ownerId: '194827192837192837',
			state: 'themes',
			extra: '171018',
			createdAtMs,
		});

		expect(customId.length).toBeLessThanOrEqual(CV2_LIMITS.CUSTOM_ID_MAX_LENGTH);

		const decoded = decodeCustomId(customId, createdAtMs + 60_000);
		expect(decoded).not.toBeNull();
		expect(decoded?.domain).toBe('ani');
		expect(decoded?.state).toBe('themes');
		expect(decoded?.isExpired).toBe(false);

		const wrongOwner = validateInteractionAccess(
			customId,
			'999999999999999999',
			createdAtMs + 60_000,
		);
		expect(wrongOwner.ok).toBe(false);
		if (!wrongOwner.ok) expect(wrongOwner.reason).toBe('NOT_OWNER');

		const expired = validateInteractionAccess(
			customId,
			'194827192837192837',
			createdAtMs + 15 * 60 * 1_000,
		);
		expect(expired.ok).toBe(false);
		if (!expired.ok) expect(expired.reason).toBe('EXPIRED');
	});

	it('builds colorless Neko CV2 containers with top tabs, KEY/Value fields, and budget safety', () => {
		const container = createNekoContainer({
			title: 'Dandadan',
			subtitle: '[ AIRING ]  |  TV Series  |  12 Episodes',
			thumbnailUrl: 'https://example.com/cover.jpg',
			tabs: [
				{ customId: 'ani:tab:1:overview:171018:t1', label: 'OVERVIEW', active: true },
				{ customId: 'ani:tab:1:themes:171018:t1', label: 'THEMES', active: false },
			],
			fields: [
				{ key: 'details', value: '**Score:** 8.64 / 10' },
				{ key: 'stats', value: 'HP  : 100\nATK : 85', codeBlock: true },
				{ key: 'huge field', value: 'A'.repeat(5_000) },
			],
			footer: 'AniList ID: 171018',
		});

		const json = container.toJSON();
		expect(json.accent_color).toBeUndefined();

		const serialized = JSON.stringify(json);
		expect(serialized).toContain('### Dandadan');
		expect(serialized).toContain('-# **DETAILS**');
		expect(serialized).toContain('```text\\nHP  : 100\\nATK : 85\\n```');
		expect(serialized).toContain('-# AniList ID: 171018');
	});

	it('builds CV2 notifications and confirmation prompts with in-place state transitions', () => {
		const notif = buildNotificationContainer({
			status: 'COOLDOWN',
			title: 'Action on Cooldown',
			message: 'Try again in **4s** (<t:1795000004:R>)',
		});
		const notifSerialized = JSON.stringify(notif.toJSON());
		expect(notifSerialized).toContain('### [ COOLDOWN ] Action on Cooldown');

		const pending = buildConfirmPrompt(
			{
				ownerId: '123456789012345678',
				title: 'Ascend Momo Ayase to 4 Stars?',
				message: 'This will consume **50 Star Shards**.',
			},
			'PENDING',
		);
		expect(JSON.stringify(pending.container.toJSON())).toContain(
			'Awaiting confirmation from <@123456789012345678>',
		);

		const confirmed = buildConfirmPrompt(
			{
				ownerId: '123456789012345678',
				title: 'Ascend Momo Ayase to 4 Stars?',
				message: 'This will consume **50 Star Shards**.',
			},
			'CONFIRMED',
		);
		expect(JSON.stringify(confirmed.container.toJSON())).toContain(
			'### [ CONFIRMED ] Ascend Momo Ayase to 4 Stars?',
		);
	});
});
