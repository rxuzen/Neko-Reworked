import ky from 'ky';

export interface SauceMatchResult {
	provider: 'SAUCENAO' | 'TRACEMOE';
	title: string;
	similarity: number;
	authorOrStudio: string;
	episodeOrPart: string | null;
	thumbnailUrl: string | null;
	externalUrl: string;
}

const traceMoeHttp = ky.create({
	prefixUrl: 'https://api.trace.moe',
	timeout: 4_000,
	retry: 0,
});

export async function searchTraceMoe(imageUrl: string): Promise<SauceMatchResult[]> {
	const response = await traceMoeHttp
		.get('search', {
			searchParams: {
				anilistInfo: '',
				url: imageUrl,
			},
		})
		.json<{
			result?: Array<{
				similarity?: number;
				episode?: number | string | null;
				image?: string | null;
				anilist?: {
					id?: number;
					title?: { romaji?: string; english?: string | null };
				};
			}>;
		}>();

	const list = response.result ?? [];
	return list.slice(0, 5).map((item) => {
		const anilistId = item.anilist?.id ?? 0;
		const title =
			item.anilist?.title?.romaji ?? item.anilist?.title?.english ?? 'Unknown Anime Frame';
		const similarity = Number(((item.similarity ?? 0) * 100).toFixed(1));

		return {
			provider: 'TRACEMOE',
			title,
			similarity,
			authorOrStudio: 'Anime Broadcast Frame',
			episodeOrPart: item.episode ? `Episode ${item.episode}` : null,
			thumbnailUrl: item.image ?? null,
			externalUrl: anilistId ? `https://anilist.co/anime/${anilistId}` : 'https://trace.moe',
		};
	});
}
