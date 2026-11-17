import ky from 'ky';

export interface MediaAutocompleteChoice {
	id: number;
	titleRomaji: string;
	titleEnglish: string | null;
	format: string;
	year: number | null;
	status: string;
}

export interface AnimeCharacterSummary {
	id: number;
	name: string;
	role: string;
	voiceActorJp: string | null;
}

export interface AnimeRelationSummary {
	id: number;
	relationType: string;
	title: string;
	format: string;
	status: string;
	siteUrl: string;
}

export interface AnimeMediaDetail {
	id: number;
	malId: number | null;
	titleRomaji: string;
	titleEnglish: string | null;
	titleNative: string | null;
	format: string;
	status: 'AIRING' | 'UPCOMING' | 'FINISHED';
	episodes: number | null;
	durationMinutes: number | null;
	season: string | null;
	seasonYear: number | null;
	source: string;
	studio: string;
	averageScore: number | null;
	popularity: number;
	favourites: number;
	genres: string[];
	tags: string[];
	description: string;
	coverImageUrl: string | null;
	siteUrl: string;
	nextAiringEpisode: {
		episode: number;
		airingAtUnix: number;
	} | null;
	characters: AnimeCharacterSummary[];
	relations: AnimeRelationSummary[];
}

export interface MangaMediaDetail {
	id: number;
	malId: number | null;
	titleRomaji: string;
	titleEnglish: string | null;
	format: string;
	status: 'AIRING' | 'UPCOMING' | 'FINISHED';
	chapters: number | null;
	volumes: number | null;
	source: string;
	averageScore: number | null;
	popularity: number;
	favourites: number;
	genres: string[];
	description: string;
	coverImageUrl: string | null;
	siteUrl: string;
	characters: AnimeCharacterSummary[];
	adaptations: AnimeRelationSummary[];
}

export interface CharacterVoiceActor {
	id: number;
	name: string;
	language: string;
	siteUrl: string;
}

export interface CharacterAppearance {
	id: number;
	title: string;
	type: 'ANIME' | 'MANGA';
	format: string;
	role: string;
	siteUrl: string;
}

export interface CharacterDetail {
	id: number;
	nameFull: string;
	nameNative: string | null;
	favourites: number;
	description: string;
	imageUrl: string | null;
	siteUrl: string;
	primaryMediaTitle: string;
	voiceActors: CharacterVoiceActor[];
	appearances: CharacterAppearance[];
}

export interface AiringScheduleEntry {
	mediaId: number;
	titleRomaji: string;
	titleEnglish: string | null;
	episode: number;
	airingAtUnix: number;
	format: string;
	siteUrl: string;
}

const jikanHttp = ky.create({
	prefixUrl: 'https://api.jikan.moe/v4',
	timeout: 3_500,
	retry: 0,
});

function mapMalStatus(status: string | undefined): 'AIRING' | 'UPCOMING' | 'FINISHED' {
	const lower = (status ?? '').toLowerCase();
	if (lower.includes('airing') || lower.includes('publishing')) return 'AIRING';
	if (lower.includes('not yet')) return 'UPCOMING';
	return 'FINISHED';
}

export async function jikanSearchAnime(query: string): Promise<AnimeMediaDetail | null> {
	const res = await jikanHttp
		.get('anime', { searchParams: { q: query, limit: 1 } })
		.json<{ data?: Array<Record<string, unknown>> }>();
	const item = res.data?.[0];
	if (!item) return null;

	const malId = Number(item.mal_id ?? 0);
	const title = String(item.title ?? 'Unknown Anime');
	const titleEnglish = item.title_english ? String(item.title_english) : null;
	const images = item.images as { jpg?: { large_image_url?: string } } | undefined;
	const studios = (item.studios as Array<{ name: string }> | undefined) ?? [];
	const genres = (item.genres as Array<{ name: string }> | undefined) ?? [];
	const themes = (item.themes as Array<{ name: string }> | undefined) ?? [];

	return {
		id: malId,
		malId,
		titleRomaji: title,
		titleEnglish,
		titleNative: item.title_japanese ? String(item.title_japanese) : null,
		format: String(item.type ?? 'TV'),
		status: mapMalStatus(item.status as string | undefined),
		episodes: typeof item.episodes === 'number' ? item.episodes : null,
		durationMinutes: null,
		season: item.season ? String(item.season).toUpperCase() : null,
		seasonYear: typeof item.year === 'number' ? item.year : null,
		source: String(item.source ?? 'Original'),
		studio: studios[0]?.name ?? 'Unknown Studio',
		averageScore: typeof item.score === 'number' ? Number(item.score.toFixed(2)) : null,
		popularity: Number(item.members ?? 0),
		favourites: Number(item.favorites ?? 0),
		genres: genres.map((g) => g.name),
		tags: themes.map((t) => t.name),
		description: String(item.synopsis ?? 'No description available.'),
		coverImageUrl: images?.jpg?.large_image_url ?? null,
		siteUrl: String(item.url ?? `https://myanimelist.net/anime/${malId}`),
		nextAiringEpisode: null,
		characters: [],
		relations: [],
	};
}

export async function jikanSearchManga(query: string): Promise<MangaMediaDetail | null> {
	const res = await jikanHttp
		.get('manga', { searchParams: { q: query, limit: 1 } })
		.json<{ data?: Array<Record<string, unknown>> }>();
	const item = res.data?.[0];
	if (!item) return null;

	const malId = Number(item.mal_id ?? 0);
	const title = String(item.title ?? 'Unknown Manga');
	const images = item.images as { jpg?: { large_image_url?: string } } | undefined;
	const genres = (item.genres as Array<{ name: string }> | undefined) ?? [];

	return {
		id: malId,
		malId,
		titleRomaji: title,
		titleEnglish: item.title_english ? String(item.title_english) : null,
		format: String(item.type ?? 'Manga'),
		status: mapMalStatus(item.status as string | undefined),
		chapters: typeof item.chapters === 'number' ? item.chapters : null,
		volumes: typeof item.volumes === 'number' ? item.volumes : null,
		source: 'Serialization',
		averageScore: typeof item.score === 'number' ? Number(item.score.toFixed(2)) : null,
		popularity: Number(item.members ?? 0),
		favourites: Number(item.favorites ?? 0),
		genres: genres.map((g) => g.name),
		description: String(item.synopsis ?? 'No description available.'),
		coverImageUrl: images?.jpg?.large_image_url ?? null,
		siteUrl: String(item.url ?? `https://myanimelist.net/manga/${malId}`),
		characters: [],
		adaptations: [],
	};
}

export async function jikanSearchCharacter(query: string): Promise<CharacterDetail | null> {
	const res = await jikanHttp
		.get('characters', { searchParams: { q: query, limit: 1 } })
		.json<{ data?: Array<Record<string, unknown>> }>();
	const item = res.data?.[0];
	if (!item) return null;

	const malId = Number(item.mal_id ?? 0);
	const images = item.images as { jpg?: { image_url?: string } } | undefined;

	return {
		id: malId,
		nameFull: String(item.name ?? 'Unknown Character'),
		nameNative: item.name_kanji ? String(item.name_kanji) : null,
		favourites: Number(item.favorites ?? 0),
		description: String(item.about ?? 'No biography available.'),
		imageUrl: images?.jpg?.image_url ?? null,
		siteUrl: String(item.url ?? `https://myanimelist.net/character/${malId}`),
		primaryMediaTitle: 'MyAnimeList Entry',
		voiceActors: [],
		appearances: [],
	};
}
