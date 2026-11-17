import { describe, expect, it } from 'bun:test';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { buildStaffCardContainer, createDefaultGuildConfig } from '../commands/staff/staff.ts';
import { CV2_LIMITS } from '../config/constants.ts';
import { getCircuitState, resetCircuitBreaker, withCircuitBreaker } from '../lib/cache.ts';
import { encodeCustomId, validateInteractionAccess } from '../lib/cv2/CustomId.ts';
import { sanitizeAnimeText } from '../lib/cv2/Formatters.ts';
import { createNekoContainer } from '../lib/cv2/NekoLayout.ts';
import { acquireActionLock, acquireDualActionLock } from '../lib/redis.ts';
import { hasRequiredStaffTier, resolveMemberStaffTier } from '../preconditions/StaffTier.ts';
import { buildEpisodeAiringAlertContainer } from '../scheduled-tasks/AiringScheduleNotifier.ts';
import { computeNextQuestResetDate } from '../scheduled-tasks/DailyQuestReset.ts';
import { buildExpeditionCompleteAlertContainer } from '../scheduled-tasks/ExpeditionCompletionCheck.ts';

describe('Phase 7: Staff Control Panel, Scheduled Tasks & End-to-End QA', () => {
	it('resolves StaffTier clearance levels (MOD, ADMIN, OWNER) accurately', () => {
		const modPerms = new PermissionsBitField([PermissionFlagsBits.ModerateMembers]);
		const adminPerms = new PermissionsBitField([PermissionFlagsBits.ManageGuild]);
		const userPerms = new PermissionsBitField([PermissionFlagsBits.SendMessages]);

		expect(resolveMemberStaffTier('999000111222333444', modPerms)).toBe('MOD');
		expect(resolveMemberStaffTier('999000111222333444', adminPerms)).toBe('ADMIN');
		expect(resolveMemberStaffTier('999000111222333444', userPerms)).toBeNull();

		expect(hasRequiredStaffTier('ADMIN', 'MOD')).toBe(true);
		expect(hasRequiredStaffTier('MOD', 'ADMIN')).toBe(false);
		expect(hasRequiredStaffTier('OWNER', 'ADMIN')).toBe(true);
	});

	it('builds /staff CV2 panel across MOD, ADMIN (Airing Feed), and OWNER (Circuit Breakers) tabs', () => {
		const guildConfig = createDefaultGuildConfig('111222333444555666');
		guildConfig.airingChannelId = '777888999000111222';

		const modCard = buildStaffCardContainer({
			ownerId: '123456789012345678',
			staffTier: 'MOD',
			tab: 'mod',
			guildConfig,
			auditRows: [],
		});
		expect(JSON.stringify(modCard.toJSON())).toContain('MODERATION & CASE DISPATCH');

		const adminCard = buildStaffCardContainer({
			ownerId: '123456789012345678',
			staffTier: 'ADMIN',
			tab: 'admin',
			guildConfig,
			auditRows: [],
		});
		const adminJson = JSON.stringify(adminCard.toJSON());
		expect(adminJson).toContain('SERVER-WIDE ANIME AIRING NOTIFICATION FEED');
		expect(adminJson).toContain('<#777888999000111222>');

		const ownerCard = buildStaffCardContainer({
			ownerId: '123456789012345678',
			staffTier: 'OWNER',
			tab: 'owner',
			guildConfig,
			auditRows: [],
		});
		const ownerJson = JSON.stringify(ownerCard.toJSON());
		expect(ownerJson).toContain('OWNER RUNTIME TELEMETRY');
		expect(ownerJson).toContain('EXTERNAL API CIRCUIT BREAKERS');
	});

	it('builds scheduled task CV2 cards for AiringScheduleNotifier, ExpeditionCompletionCheck, and DailyQuestReset', () => {
		const airingCard = buildEpisodeAiringAlertContainer(
			{
				mediaId: 171018,
				titleRomaji: 'Dandadan',
				titleEnglish: 'DAN DA DAN',
				episode: 9,
				airingAtUnix: 1_795_086_000,
				format: 'TV',
				siteUrl: 'https://anilist.co/anime/171018',
			},
			'ENGLISH',
		);
		expect(JSON.stringify(airingCard.toJSON())).toContain('### [ AIRING ] DAN DA DAN — Episode 9');

		const expCard = buildExpeditionCompleteAlertContainer(
			'Momo Ayase',
			'Akihabara Arcade District',
		);
		expect(JSON.stringify(expCard.toJSON())).toContain(
			'### [ CONFIRMED ] Neko Expedition Complete!',
		);

		const now = new Date(1_795_000_000_000);
		const nextDaily = computeNextQuestResetDate('DAILY', now);
		const nextWeekly = computeNextQuestResetDate('WEEKLY', now);
		expect(nextDaily.getTime() - now.getTime()).toBe(24 * 3_600_000);
		expect(nextWeekly.getTime() - now.getTime()).toBe(7 * 24 * 3_600_000);
	});

	it('passes end-to-end QA: character budget cap, spoiler safety, dual locks, circuit breaker, and 15m expiry', async () => {
		// 1. Character budget truncation (<= 3,850 chars)
		const massiveCard = createNekoContainer({
			title: 'End-to-End Budget Stress Test',
			fields: [
				{ key: 'FIELD 1', value: 'X'.repeat(2_200) },
				{ key: 'FIELD 2', value: 'Y'.repeat(2_200) },
				{ key: 'FIELD 3', value: 'Z'.repeat(2_200) },
			],
			footer: 'Budget Test Footer',
		});
		const serialized = JSON.stringify(massiveCard.toJSON());
		expect(serialized.length).toBeLessThanOrEqual(CV2_LIMITS.MAX_CHARACTERS);

		// 2. Spoiler & HTML sanitization safety
		const complexSpoilers =
			'<b>Warning:</b> ~!First spoiler block!~ and <br> ~!Second very long spoiler block that will be sliced right in the middle of the secret!~';
		const sanitized = sanitizeAnimeText(complexSpoilers, 65);
		const delimiterCount = (sanitized.match(/\|\|/g) ?? []).length;
		expect(delimiterCount % 2).toBe(0);
		expect(sanitized).not.toContain('<b>');
		expect(sanitized).not.toContain('<br>');

		// 3. Single & Dual Action Locks
		const dual = await acquireDualActionLock('qa_user_2', 'qa_user_1', 1_500);
		expect(dual.acquired).toBe(true);
		const blocked = await acquireActionLock('qa_user_1', 1_500);
		expect(blocked.acquired).toBe(false);
		await dual.release();

		// 4. Circuit Breaker Trip & Reset
		resetCircuitBreaker('qa-service');
		for (let i = 0; i < 5; i++) {
			await withCircuitBreaker(
				'qa-service',
				async () => {
					throw new Error('503 Service Unavailable');
				},
				async () => 'fallback-ok',
				5_000,
			);
		}
		expect(getCircuitState('qa-service', 5_500).isOpen).toBe(true);
		resetCircuitBreaker('qa-service');
		expect(getCircuitState('qa-service', 5_500).isOpen).toBe(false);

		// 5. 15-Minute Expired Interaction Guard
		const startMs = 1_795_000_000_000;
		const cid = encodeCustomId({
			domain: 'ani',
			action: 'tab',
			ownerId: '123456789012345678',
			state: 'overview',
			extra: '171018',
			createdAtMs: startMs,
		});
		const after15Min = validateInteractionAccess(
			cid,
			'123456789012345678',
			startMs + 15 * 60 * 1_000,
		);
		expect(after15Min.ok).toBe(false);
		if (!after15Min.ok) {
			expect(after15Min.reason).toBe('EXPIRED');
		}
	});
});
