import ky from 'ky';
import { getOrSetCache, withCircuitBreaker } from '../lib/cache.ts';

export interface AnimeThemeEntry {
	type: 'OP' | 'ED';
	sequence: number;
	slug: string;
	songTitle: string;
	artists: string[];
	episodes: string | null;
	videoUrl: string | null;
}

const animeThemesHttp = ky.create({
	prefixUrl: 'https://api.animethemes.moe',
	timeout: 3_000,
	retry: 0,
});

export async function getAnimeThemesByAnilistId(anilistId: number): Promise<AnimeThemeEntry[]> {
	return getOrSetCache(
		`themes:anilist:${anilistId}`,
		async () =>
			withCircuitBreaker(
				'animethemes',
				async () => {
					const response = await animeThemesHttp
						.get('anime', {
							searchParams: {
								'filter[has]': 'resources',
								'filter[site]': 'AniList',
								'filter[external_id]': String(anilistId),
								include: 'animethemes.animethemeentries.videos,animethemes.song.artists',
							},
						})
						.json<{
							anime?: Array<{
								animethemes?: Array<{
									type?: string;
									sequence?: number | null;
									slug?: string;
									song?: {
										title?: string;
										artists?: Array<{ name?: string }>;
									};
									animethemeentries?: Array<{
										episodes?: string | null;
										videos?: Array<{ link?: string | null }>;
									}>;
								}>;
							}>;
						}>();

					const firstAnime = response.anime?.[0];
					if (!firstAnime?.animethemes) return [];

					return firstAnime.animethemes.slice(0, 12).map((theme) => {
						const entry = theme.animethemeentries?.[0];
						const artists =
							theme.song?.artists?.map((a) => a.name ?? '').filter((n) => n.length > 0) ?? [];

						return {
							type: theme.type === 'ED' ? 'ED' : 'OP',
							sequence: theme.sequence ?? 1,
							slug: theme.slug ?? (theme.type === 'ED' ? 'ED1' : 'OP1'),
							songTitle: theme.song?.title ?? 'Untitled Theme',
							artists,
							episodes: entry?.episodes ?? null,
							videoUrl: entry?.videos?.[0]?.link ?? null,
						};
					});
				},
				async () => [],
			),
		{ l1TtlMs: 60_000, l2TtlSeconds: 86_400 },
	);
}
