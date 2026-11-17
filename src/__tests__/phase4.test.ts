import { describe, expect, it } from 'bun:test';
import { buildAnimeCardContainer } from '../commands/media/anime.ts';
import { buildCharacterCardContainer, deriveCharacterRarity } from '../commands/media/character.ts';
import { buildMangaCardContainer } from '../commands/media/manga.ts';
import { buildSauceCardContainer } from '../commands/media/sauce.ts';
import { buildScheduleCardContainer } from '../commands/media/schedule.ts';
import { buildSocialCardContainer } from '../commands/social/social.ts';
import type {
	AnimeMediaDetail,
	CharacterDetail,
	MangaMediaDetail,
} from '../services/jikan.service.ts';
import { hashImageQuery } from '../services/saucenao.service.ts';

const mockAnime: AnimeMediaDetail = {
	id: 171018,
	malId: 57334,
	titleRomaji: 'Dandadan',
	titleEnglish: 'DAN DA DAN',
	titleNative: 'ダンダダン',
	format: 'TV',
	status: 'AIRING',
	episodes: 12,
	durationMinutes: 24,
	season: 'FALL',
	seasonYear: 2026,
	source: 'MANGA',
	studio: 'Science SARU',
	averageScore: 8.64,
	popularity: 245_000,
	favourites: 18_400,
	genres: ['Action', 'Comedy', 'Supernatural'],
	tags: ['Aliens', 'Ghosts', 'Occult'],
	description:
		'High schoolers <i>Momo Ayase</i> and Ken Takakura discover ~!both ghosts and aliens are real!~.',
	coverImageUrl: 'https://example.com/dandadan.jpg',
	siteUrl: 'https://anilist.co/anime/171018',
	nextAiringEpisode: {
		episode: 8,
		airingAtUnix: Math.floor(Date.now() / 1_000) + 86_400,
	},
	characters: [
		{
			id: 284910,
			name: 'Momo Ayase',
			role: 'MAIN',
			voiceActorJp: 'Shion Wakayama',
		},
	],
	relations: [
		{
			id: 132029,
			relationType: 'SOURCE',
			title: 'Dandadan (Manga)',
			format: 'MANGA',
			status: 'AIRING',
			siteUrl: 'https://anilist.co/manga/132029',
		},
	],
};

describe('Phase 4: Standalone Media & Social Commands (With Autocomplete)', () => {
	it('builds /anime CV2 cards across OVERVIEW, CHARACTERS, RELATIONS, THEMES, and STATS tabs', () => {
		const overview = buildAnimeCardContainer({
			ownerId: '123456789012345678',
			anime: mockAnime,
			tab: 'overview',
			titleMode: 'ENGLISH',
			inWatchlist: true,
			notifyOnAir: true,
		});
		const overviewJson = JSON.stringify(overview.toJSON());
		expect(overviewJson).toContain('### DAN DA DAN');
		expect(overviewJson).toContain('[ AIRING ]');
		expect(overviewJson).toContain('||both ghosts and aliens are real||');
		expect(overviewJson).toContain('✓ In Watchlist');

		const themes = buildAnimeCardContainer({
			ownerId: '123456789012345678',
			anime: mockAnime,
			tab: 'themes',
			titleMode: 'ROMAJI',
			themes: [
				{
					type: 'OP',
					sequence: 1,
					slug: 'OP1',
					songTitle: 'Otonoke',
					artists: ['Creepy Nuts'],
					episodes: '1-12',
					videoUrl: 'https://v.animethemes.moe/Dandadan-OP1.webm',
				},
			],
		});
		const themesJson = JSON.stringify(themes.toJSON());
		expect(themesJson).toContain('Otonoke');
		expect(themesJson).toContain('Creepy Nuts');
	});

	it('builds /manga CV2 cards across OVERVIEW, CHARACTERS, and ADAPTATIONS tabs', () => {
		const mockManga: MangaMediaDetail = {
			id: 132029,
			malId: 135496,
			titleRomaji: 'Dandadan',
			titleEnglish: 'DAN DA DAN',
			format: 'MANGA',
			status: 'AIRING',
			chapters: 175,
			volumes: 17,
			source: 'ORIGINAL',
			averageScore: 8.52,
			popularity: 95_000,
			favourites: 9_200,
			genres: ['Action', 'Supernatural'],
			description: 'Published in ~!Shounen Jump+!~.',
			coverImageUrl: 'https://example.com/manga.jpg',
			siteUrl: 'https://anilist.co/manga/132029',
			characters: [{ id: 284910, name: 'Momo Ayase', role: 'MAIN', voiceActorJp: null }],
			adaptations: [],
		};

		const card = buildMangaCardContainer({
			ownerId: '123456789012345678',
			manga: mockManga,
			tab: 'overview',
			titleMode: 'ROMAJI',
		});
		const json = JSON.stringify(card.toJSON());
		expect(json).toContain('175 Chapters');
		expect(json).toContain('||Shounen Jump+||');
	});

	it('builds /character CV2 cards with Seiyuu links, spoiler bios, and live Gacha ownership badges', () => {
		expect(deriveCharacterRarity(30_000)).toBe('UR');
		expect(deriveCharacterRarity(12_000)).toBe('SSR');

		const mockChar: CharacterDetail = {
			id: 284910,
			nameFull: 'Momo Ayase',
			nameNative: '綾瀬 桃',
			favourites: 14_820,
			description: 'Raised by her grandmother, ~!Seiko Ayase, awakening psychokinetic powers!~.',
			imageUrl: 'https://example.com/momo.jpg',
			siteUrl: 'https://anilist.co/character/284910',
			primaryMediaTitle: 'Dandadan',
			voiceActors: [
				{
					id: 134512,
					name: 'Shion Wakayama',
					language: 'Japanese',
					siteUrl: 'https://anilist.co/staff/134512',
				},
			],
			appearances: [
				{
					id: 171018,
					title: 'Dandadan',
					type: 'ANIME',
					format: 'TV',
					role: 'MAIN',
					siteUrl: 'https://anilist.co/anime/171018',
				},
			],
		};

		const card = buildCharacterCardContainer({
			ownerId: '123456789012345678',
			character: mockChar,
			tab: 'overview',
			gachaStatus: {
				owned: true,
				rarity: 'SSR',
				stars: 3,
				wishlistedSlot: 1,
			},
		});

		const json = JSON.stringify(card.toJSON());
		expect(json).toContain('[ OWNED ★★★☆☆ ]');
		expect(json).toContain('Shion Wakayama');
		expect(json).toContain('[ WISHLISTED ] (Slot 1/3)');
		expect(json).toContain('||Seiko Ayase, awakening psychokinetic powers||');
	});

	it('builds /schedule, /sauce, and /social CV2 cards cleanly', () => {
		const scheduleCard = buildScheduleCardContainer({
			ownerId: '123456789012345678',
			tab: 'today',
			entries: [
				{
					mediaId: 171018,
					titleRomaji: 'Dandadan',
					titleEnglish: 'DAN DA DAN',
					episode: 8,
					airingAtUnix: 1_795_086_000,
					format: 'TV',
					siteUrl: 'https://anilist.co/anime/171018',
				},
			],
			watchlistItems: [],
			timezone: 'Asia/Tokyo',
			titleMode: 'ROMAJI',
		});
		expect(JSON.stringify(scheduleCard.toJSON())).toContain('Asia/Tokyo');

		const hash = hashImageQuery('https://example.com/frame.png');
		expect(hash.length).toBe(32);

		const sauceCard = buildSauceCardContainer({
			ownerId: '123456789012345678',
			queryHash: hash,
			matches: [
				{
					provider: 'SAUCENAO',
					title: 'Dandadan Key Visual',
					similarity: 94.2,
					authorOrStudio: 'Yukinobu Tatsu',
					episodeOrPart: 'Episode 1',
					thumbnailUrl: 'https://example.com/thumb.jpg',
					externalUrl: 'https://anilist.co/anime/171018',
				},
			],
			index: 0,
		});
		expect(JSON.stringify(sauceCard.toJSON())).toContain('94.2%');

		const socialCard = buildSocialCardContainer({
			ownerId: '123456789012345678',
			actorId: '123456789012345678',
			targetId: '987654321098765432',
			action: 'pat',
			gif: {
				url: 'https://nekos.best/api/v2/pat/001.gif',
				animeName: 'K-On!',
				provider: 'NEKOSBEST',
			},
		});
		const socialJson = JSON.stringify(socialCard.toJSON());
		expect(socialJson).toContain('gentle Neko headpats');
		expect(socialJson).toContain('K-On!');
	});
});
