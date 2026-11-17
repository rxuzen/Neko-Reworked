import ky from 'ky';
import { env } from '../config/env.ts';
import { getOrSetCache, withCircuitBreaker } from '../lib/cache.ts';
import { redis } from '../lib/redis.ts';
import { type SauceMatchResult, searchTraceMoe } from './tracemoe.service.ts';

const sauceNaoHttp = ky.create({
	prefixUrl: 'https://saucenao.com',
	timeout: 4_000,
	retry: 0,
});

export function hashImageQuery(imageUrl: string): string {
	const hasher = new Bun.CryptoHasher('sha256');
	hasher.update(imageUrl.trim());
	return hasher.digest('hex').slice(0, 32);
}

export async function searchSauce(imageUrl: string): Promise<SauceMatchResult[]> {
	const hashKey = `sauce:${hashImageQuery(imageUrl)}`;

	return getOrSetCache(
		hashKey,
		async () => {
			if (!env.SAUCENAO_API_KEY) {
				return searchTraceMoe(imageUrl);
			}

			if (redis.status === 'ready') {
				try {
					const longRemaining = await redis.get('quota:saucenao:long');
					if (longRemaining !== null && Number(longRemaining) <= 0) {
						return searchTraceMoe(imageUrl);
					}
				} catch {
					// Ignore Redis quota lookup failure
				}
			}

			return withCircuitBreaker(
				'saucenao',
				async () => {
					const response = await sauceNaoHttp
						.get('search.php', {
							searchParams: {
								output_type: '2',
								numres: '5',
								api_key: env.SAUCENAO_API_KEY,
								url: imageUrl,
							},
						})
						.json<{
							header?: {
								short_remaining?: number;
								long_remaining?: number;
							};
							results?: Array<{
								header?: {
									similarity?: string;
									thumbnail?: string;
								};
								data?: {
									title?: string;
									source?: string;
									member_name?: string;
									creator?: string | string[];
									part?: string;
									ext_urls?: string[];
								};
							}>;
						}>();

					if (response.header && redis.status === 'ready') {
						if (typeof response.header.long_remaining === 'number') {
							void redis
								.set('quota:saucenao:long', String(response.header.long_remaining), 'EX', 3_600)
								.catch(() => {});
						}
					}

					const matches: SauceMatchResult[] = (response.results ?? []).map((r) => {
						const sim = Number.parseFloat(r.header?.similarity ?? '0');
						const creator = Array.isArray(r.data?.creator)
							? r.data?.creator.join(', ')
							: r.data?.creator;

						return {
							provider: 'SAUCENAO',
							title: r.data?.title ?? r.data?.source ?? 'Artwork Match',
							similarity: Number(sim.toFixed(1)),
							authorOrStudio: r.data?.member_name ?? creator ?? 'Unknown Artist / Studio',
							episodeOrPart: r.data?.part ? `Part / Ep ${r.data.part}` : null,
							thumbnailUrl: r.header?.thumbnail ?? null,
							externalUrl: r.data?.ext_urls?.[0] ?? 'https://saucenao.com',
						};
					});

					const topSimilarity = matches[0]?.similarity ?? 0;
					if (matches.length === 0 || topSimilarity < 55) {
						const traceMatches = await searchTraceMoe(imageUrl).catch(() => []);
						if (traceMatches.length > 0) {
							return [...traceMatches, ...matches].slice(0, 5);
						}
					}

					return matches;
				},
				async () => searchTraceMoe(imageUrl),
			);
		},
		{ l1TtlMs: 60_000, l2TtlSeconds: 86_400 },
	);
}
