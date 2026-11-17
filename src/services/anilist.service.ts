import ky from 'ky';
import { getOrSetCache, withCircuitBreaker } from '../lib/cache.ts';
import { redis } from '../lib/redis.ts';
import {
	type AiringScheduleEntry,
	type AnimeMediaDetail,
	type CharacterDetail,
	type MangaMediaDetail,
	type MediaAutocompleteChoice,
	jikanSearchAnime,
	jikanSearchCharacter,
	jikanSearchManga,
} from './jikan.service.ts';

const anilistHttp = ky.create({
	prefixUrl: 'https://graphql.anilist.co',
	timeout: 2_500,
	retry: 0,
	hooks: {
		afterResponse: [
			(_request, _options, response) => {
				const remaining = response.headers.get('x-ratelimit-remaining');
				if (remaining && redis.status === 'ready') {
					void redis.set('quota:anilist:remaining', remaining, 'EX', 120).catch(() => {});
				}
			},
		],
	},
});

async function graphqlQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
	const response = await anilistHttp
		.post('', {
			json: { query, variables },
		})
		.json<{ data?: T; errors?: Array<{ message: string }> }>();

	if (!response.data) {
		throw new Error(response.errors?.[0]?.message ?? 'Empty AniList GraphQL response');
	}
	return response.data;
}

export function mapAniListStatus(
	status: string | null | undefined,
): 'AIRING' | 'UPCOMING' | 'FINISHED' {
	switch (status) {
		case 'RELEASING':
			return 'AIRING';
		case 'NOT_YET_RELEASED':
			return 'UPCOMING';
		default:
			return 'FINISHED';
	}
}

const AUTOCOMPLETE_MEDIA_QUERY = `
query ($search: String, $type: MediaType) {
  Page(page: 1, perPage: 10) {
    media(search: $search, type: $type, sort: POPULARITY_DESC, isAdult: false) {
      id
      title { romaji english }
      format
      seasonYear
      status
    }
  }
}
`;

export async function autocompleteMedia(
	query: string,
	type: 'ANIME' | 'MANGA',
): Promise<MediaAutocompleteChoice[]> {
	const clean = query.trim().toLowerCase();
	if (clean.length < 2) return [];

	return getOrSetCache(
		`ac:${type.toLowerCase()}:${clean}`,
		async () =>
			withCircuitBreaker(
				'anilist',
				async () => {
					const data = await graphqlQuery<{
						Page: {
							media: Array<{
								id: number;
								title: { romaji: string; english: string | null };
								format: string | null;
								seasonYear: number | null;
								status: string | null;
							}>;
						};
					}>(AUTOCOMPLETE_MEDIA_QUERY, { search: query.trim(), type });

					return data.Page.media.map((m) => ({
						id: m.id,
						titleRomaji: m.title.romaji,
						titleEnglish: m.title.english,
						format: m.format ?? type,
						year: m.seasonYear,
						status: mapAniListStatus(m.status),
					}));
				},
				async () => [],
			),
		{ l1TtlMs: 60_000, l2TtlSeconds: 21_600 },
	);
}

const AUTOCOMPLETE_CHARACTER_QUERY = `
query ($search: String) {
  Page(page: 1, perPage: 10) {
    characters(search: $search, sort: FAVOURITES_DESC) {
      id
      name { full }
      favourites
      media(perPage: 1, sort: POPULARITY_DESC) {
        nodes { title { romaji } }
      }
    }
  }
}
`;

export interface CharacterAutocompleteChoice {
	id: number;
	nameFull: string;
	mediaTitle: string;
	favourites: number;
}

export async function autocompleteCharacter(query: string): Promise<CharacterAutocompleteChoice[]> {
	const clean = query.trim().toLowerCase();
	if (clean.length < 2) return [];

	return getOrSetCache(
		`ac:char:${clean}`,
		async () =>
			withCircuitBreaker(
				'anilist',
				async () => {
					const data = await graphqlQuery<{
						Page: {
							characters: Array<{
								id: number;
								name: { full: string };
								favourites: number | null;
								media?: { nodes?: Array<{ title?: { romaji?: string } }> };
							}>;
						};
					}>(AUTOCOMPLETE_CHARACTER_QUERY, { search: query.trim() });

					return data.Page.characters.map((c) => ({
						id: c.id,
						nameFull: c.name.full,
						mediaTitle: c.media?.nodes?.[0]?.title?.romaji ?? 'Anime / Manga',
						favourites: c.favourites ?? 0,
					}));
				},
				async () => [],
			),
		{ l1TtlMs: 60_000, l2TtlSeconds: 21_600 },
	);
}

const ANIME_DETAIL_QUERY = `
query ($id: Int, $search: String) {
  Media(id: $id, search: $search, type: ANIME, isAdult: false) {
    id
    idMal
    title { romaji english native }
    format
    status
    episodes
    duration
    season
    seasonYear
    source
    averageScore
    popularity
    favourites
    genres
    tags { name rank isMediaSpoiler }
    description(asHtml: false)
    coverImage { extraLarge large }
    siteUrl
    studios(isMain: true) { nodes { name } }
    nextAiringEpisode { episode airingAt }
    characters(sort: [ROLE, RELEVANCE, ID], perPage: 8) {
      edges {
        role
        node { id name { full } }
        voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) {
          name { full }
        }
      }
    }
    relations {
      edges {
        relationType(version: 2)
        node {
          id
          title { romaji english }
          format
          status
          siteUrl
        }
      }
    }
  }
}
`;

export async function getAnimeByIdOrSearch(queryOrId: string): Promise<AnimeMediaDetail | null> {
	const trimmed = queryOrId.trim();
	const numericId = /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : undefined;
	const cacheKey = numericId ? `anime:id:${numericId}` : `anime:q:${trimmed.toLowerCase()}`;

	return getOrSetCache(
		cacheKey,
		async () =>
			withCircuitBreaker(
				'anilist',
				async () => {
					const data = await graphqlQuery<{ Media: Record<string, unknown> | null }>(
						ANIME_DETAIL_QUERY,
						numericId ? { id: numericId } : { search: trimmed },
					);
					const m = data.Media;
					if (!m) return null;

					const titleObj = m.title as {
						romaji?: string;
						english?: string | null;
						native?: string | null;
					};
					const coverObj = m.coverImage as {
						extraLarge?: string | null;
						large?: string | null;
					} | null;
					const studiosObj = m.studios as { nodes?: Array<{ name: string }> } | null;
					const nextAir = m.nextAiringEpisode as {
						episode: number;
						airingAt: number;
					} | null;
					const tags = (m.tags as Array<{ name: string; isMediaSpoiler?: boolean }> | null) ?? [];
					const charEdges =
						(
							m.characters as {
								edges?: Array<{
									role?: string;
									node?: { id: number; name?: { full?: string } };
									voiceActors?: Array<{ name?: { full?: string } }>;
								}>;
							} | null
						)?.edges ?? [];
					const relEdges =
						(
							m.relations as {
								edges?: Array<{
									relationType?: string;
									node?: {
										id: number;
										title?: { romaji?: string; english?: string | null };
										format?: string;
										status?: string;
										siteUrl?: string;
									};
								}>;
							} | null
						)?.edges ?? [];

					return {
						id: Number(m.id),
						malId: typeof m.idMal === 'number' ? m.idMal : null,
						titleRomaji: titleObj?.romaji ?? 'Unknown Title',
						titleEnglish: titleObj?.english ?? null,
						titleNative: titleObj?.native ?? null,
						format: String(m.format ?? 'TV'),
						status: mapAniListStatus(m.status as string | null),
						episodes: typeof m.episodes === 'number' ? m.episodes : null,
						durationMinutes: typeof m.duration === 'number' ? m.duration : null,
						season: m.season ? String(m.season) : null,
						seasonYear: typeof m.seasonYear === 'number' ? m.seasonYear : null,
						source: String(m.source ?? 'ORIGINAL').replace(/_/g, ' '),
						studio: studiosObj?.nodes?.[0]?.name ?? 'Unknown Studio',
						averageScore:
							typeof m.averageScore === 'number' ? Number((m.averageScore / 10).toFixed(2)) : null,
						popularity: Number(m.popularity ?? 0),
						favourites: Number(m.favourites ?? 0),
						genres: (m.genres as string[] | null) ?? [],
						tags: tags
							.filter((t) => !t.isMediaSpoiler)
							.slice(0, 6)
							.map((t) => t.name),
						description: String(m.description ?? 'No description available.'),
						coverImageUrl: coverObj?.extraLarge ?? coverObj?.large ?? null,
						siteUrl: String(m.siteUrl ?? `https://anilist.co/anime/${m.id}`),
						nextAiringEpisode: nextAir
							? {
									episode: nextAir.episode,
									airingAtUnix: nextAir.airingAt,
								}
							: null,
						characters: charEdges.map((edge) => ({
							id: edge.node?.id ?? 0,
							name: edge.node?.name?.full ?? 'Unknown',
							role: edge.role ?? 'SUPPORTING',
							voiceActorJp: edge.voiceActors?.[0]?.name?.full ?? null,
						})),
						relations: relEdges.slice(0, 8).map((edge) => ({
							id: edge.node?.id ?? 0,
							relationType: String(edge.relationType ?? 'RELATED').replace(/_/g, ' '),
							title: edge.node?.title?.romaji ?? edge.node?.title?.english ?? 'Related Media',
							format: String(edge.node?.format ?? 'MEDIA'),
							status: mapAniListStatus(edge.node?.status),
							siteUrl: String(edge.node?.siteUrl ?? 'https://anilist.co'),
						})),
					};
				},
				async () => jikanSearchAnime(trimmed),
			),
		{ l1TtlMs: 60_000, l2TtlSeconds: 21_600 },
	);
}

const MANGA_DETAIL_QUERY = `
query ($id: Int, $search: String) {
  Media(id: $id, search: $search, type: MANGA, isAdult: false) {
    id
    idMal
    title { romaji english }
    format
    status
    chapters
    volumes
    source
    averageScore
    popularity
    favourites
    genres
    description(asHtml: false)
    coverImage { extraLarge large }
    siteUrl
    characters(sort: [ROLE, RELEVANCE, ID], perPage: 8) {
      edges {
        role
        node { id name { full } }
      }
    }
    relations {
      edges {
        relationType(version: 2)
        node {
          id
          title { romaji english }
          format
          status
          siteUrl
        }
      }
    }
  }
}
`;

export async function getMangaByIdOrSearch(queryOrId: string): Promise<MangaMediaDetail | null> {
	const trimmed = queryOrId.trim();
	const numericId = /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : undefined;
	const cacheKey = numericId ? `manga:id:${numericId}` : `manga:q:${trimmed.toLowerCase()}`;

	return getOrSetCache(
		cacheKey,
		async () =>
			withCircuitBreaker(
				'anilist',
				async () => {
					const data = await graphqlQuery<{ Media: Record<string, unknown> | null }>(
						MANGA_DETAIL_QUERY,
						numericId ? { id: numericId } : { search: trimmed },
					);
					const m = data.Media;
					if (!m) return null;

					const titleObj = m.title as { romaji?: string; english?: string | null };
					const coverObj = m.coverImage as {
						extraLarge?: string | null;
						large?: string | null;
					} | null;
					const charEdges =
						(
							m.characters as {
								edges?: Array<{
									role?: string;
									node?: { id: number; name?: { full?: string } };
								}>;
							} | null
						)?.edges ?? [];
					const relEdges =
						(
							m.relations as {
								edges?: Array<{
									relationType?: string;
									node?: {
										id: number;
										title?: { romaji?: string; english?: string | null };
										format?: string;
										status?: string;
										siteUrl?: string;
									};
								}>;
							} | null
						)?.edges ?? [];

					return {
						id: Number(m.id),
						malId: typeof m.idMal === 'number' ? m.idMal : null,
						titleRomaji: titleObj?.romaji ?? 'Unknown Manga',
						titleEnglish: titleObj?.english ?? null,
						format: String(m.format ?? 'MANGA'),
						status: mapAniListStatus(m.status as string | null),
						chapters: typeof m.chapters === 'number' ? m.chapters : null,
						volumes: typeof m.volumes === 'number' ? m.volumes : null,
						source: String(m.source ?? 'ORIGINAL').replace(/_/g, ' '),
						averageScore:
							typeof m.averageScore === 'number' ? Number((m.averageScore / 10).toFixed(2)) : null,
						popularity: Number(m.popularity ?? 0),
						favourites: Number(m.favourites ?? 0),
						genres: (m.genres as string[] | null) ?? [],
						description: String(m.description ?? 'No description available.'),
						coverImageUrl: coverObj?.extraLarge ?? coverObj?.large ?? null,
						siteUrl: String(m.siteUrl ?? `https://anilist.co/manga/${m.id}`),
						characters: charEdges.map((edge) => ({
							id: edge.node?.id ?? 0,
							name: edge.node?.name?.full ?? 'Unknown',
							role: edge.role ?? 'MAIN',
							voiceActorJp: null,
						})),
						adaptations: relEdges.slice(0, 8).map((edge) => ({
							id: edge.node?.id ?? 0,
							relationType: String(edge.relationType ?? 'ADAPTATION').replace(/_/g, ' '),
							title: edge.node?.title?.romaji ?? edge.node?.title?.english ?? 'Related Media',
							format: String(edge.node?.format ?? 'ANIME'),
							status: mapAniListStatus(edge.node?.status),
							siteUrl: String(edge.node?.siteUrl ?? 'https://anilist.co'),
						})),
					};
				},
				async () => jikanSearchManga(trimmed),
			),
		{ l1TtlMs: 60_000, l2TtlSeconds: 21_600 },
	);
}

const CHARACTER_DETAIL_QUERY = `
query ($id: Int, $search: String) {
  Character(id: $id, search: $search) {
    id
    name { full native }
    favourites
    description(asHtml: false)
    image { large }
    siteUrl
    media(sort: POPULARITY_DESC, perPage: 10) {
      edges {
        characterRole
        node {
          id
          type
          format
          title { romaji english }
          siteUrl
        }
        voiceActors(sort: [RELEVANCE, ID]) {
          id
          name { full }
          languageV2
          siteUrl
        }
      }
    }
  }
}
`;

export async function getCharacterByIdOrSearch(queryOrId: string): Promise<CharacterDetail | null> {
	const trimmed = queryOrId.trim();
	const numericId = /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : undefined;
	const cacheKey = numericId ? `char:id:${numericId}` : `char:q:${trimmed.toLowerCase()}`;

	return getOrSetCache(
		cacheKey,
		async () =>
			withCircuitBreaker(
				'anilist',
				async () => {
					const data = await graphqlQuery<{
						Character: Record<string, unknown> | null;
					}>(CHARACTER_DETAIL_QUERY, numericId ? { id: numericId } : { search: trimmed });
					const c = data.Character;
					if (!c) return null;

					const nameObj = c.name as { full?: string; native?: string | null };
					const imageObj = c.image as { large?: string | null } | null;
					const mediaEdges =
						(
							c.media as {
								edges?: Array<{
									characterRole?: string;
									node?: {
										id: number;
										type?: 'ANIME' | 'MANGA';
										format?: string;
										title?: { romaji?: string; english?: string | null };
										siteUrl?: string;
									};
									voiceActors?: Array<{
										id: number;
										name?: { full?: string };
										languageV2?: string;
										siteUrl?: string;
									}>;
								}>;
							} | null
						)?.edges ?? [];

					const voiceActorMap = new Map<
						number,
						{ id: number; name: string; language: string; siteUrl: string }
					>();
					for (const edge of mediaEdges) {
						for (const va of edge.voiceActors ?? []) {
							if (!voiceActorMap.has(va.id)) {
								voiceActorMap.set(va.id, {
									id: va.id,
									name: va.name?.full ?? 'Unknown Seiyuu',
									language: va.languageV2 ?? 'Japanese',
									siteUrl: va.siteUrl ?? `https://anilist.co/staff/${va.id}`,
								});
							}
						}
					}

					const appearances = mediaEdges.map((edge) => ({
						id: edge.node?.id ?? 0,
						title: edge.node?.title?.romaji ?? edge.node?.title?.english ?? 'Unknown Title',
						type: (edge.node?.type ?? 'ANIME') as 'ANIME' | 'MANGA',
						format: String(edge.node?.format ?? 'TV'),
						role: String(edge.characterRole ?? 'MAIN'),
						siteUrl: String(edge.node?.siteUrl ?? 'https://anilist.co'),
					}));

					return {
						id: Number(c.id),
						nameFull: nameObj?.full ?? 'Unknown Character',
						nameNative: nameObj?.native ?? null,
						favourites: Number(c.favourites ?? 0),
						description: String(c.description ?? 'No biography available.'),
						imageUrl: imageObj?.large ?? null,
						siteUrl: String(c.siteUrl ?? `https://anilist.co/character/${c.id}`),
						primaryMediaTitle: appearances[0]?.title ?? 'Anime & Manga',
						voiceActors: [...voiceActorMap.values()].slice(0, 8),
						appearances: appearances.slice(0, 8),
					};
				},
				async () => jikanSearchCharacter(trimmed),
			),
		{ l1TtlMs: 60_000, l2TtlSeconds: 21_600 },
	);
}

const AIRING_SCHEDULE_QUERY = `
query ($airingAtGreater: Int, $airingAtLesser: Int) {
  Page(page: 1, perPage: 20) {
    airingSchedules(airingAt_greater: $airingAtGreater, airingAt_lesser: $airingAtLesser, sort: TIME) {
      episode
      airingAt
      media {
        id
        isAdult
        format
        siteUrl
        title { romaji english }
      }
    }
  }
}
`;

export async function getAiringSchedule(
	startUnix: number,
	endUnix: number,
): Promise<AiringScheduleEntry[]> {
	const cacheKey = `schedule:${Math.floor(startUnix / 1_800)}:${Math.floor(endUnix / 1_800)}`;

	return getOrSetCache(
		cacheKey,
		async () =>
			withCircuitBreaker(
				'anilist',
				async () => {
					const data = await graphqlQuery<{
						Page: {
							airingSchedules: Array<{
								episode: number;
								airingAt: number;
								media?: {
									id: number;
									isAdult?: boolean;
									format?: string;
									siteUrl?: string;
									title?: { romaji?: string; english?: string | null };
								};
							}>;
						};
					}>(AIRING_SCHEDULE_QUERY, {
						airingAtGreater: startUnix,
						airingAtLesser: endUnix,
					});

					return data.Page.airingSchedules
						.filter((item) => item.media && !item.media.isAdult)
						.map((item) => ({
							mediaId: item.media?.id ?? 0,
							titleRomaji: item.media?.title?.romaji ?? 'Unknown Anime',
							titleEnglish: item.media?.title?.english ?? null,
							episode: item.episode,
							airingAtUnix: item.airingAt,
							format: String(item.media?.format ?? 'TV'),
							siteUrl: String(
								item.media?.siteUrl ?? `https://anilist.co/anime/${item.media?.id ?? 0}`,
							),
						}));
				},
				async () => [],
			),
		{ l1TtlMs: 60_000, l2TtlSeconds: 1_800 },
	);
}
