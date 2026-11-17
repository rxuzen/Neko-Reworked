import ky from 'ky';
import { withCircuitBreaker } from '../lib/cache.ts';

export const SOCIAL_ACTIONS = [
	'hug',
	'pat',
	'poke',
	'bonk',
	'blush',
	'wave',
	'highfive',
	'smile',
	'cuddle',
	'slap',
] as const;

export type SocialActionType = (typeof SOCIAL_ACTIONS)[number];

export interface SocialActionMeta {
	action: SocialActionType;
	label: string;
	selfTemplate: (actor: string) => string;
	targetTemplate: (actor: string, target: string) => string;
}

export const SOCIAL_ACTION_META: Record<SocialActionType, SocialActionMeta> = {
	hug: {
		action: 'hug',
		label: 'Hug',
		selfTemplate: (a) => `${a} wraps themselves in a warm Neko blanket hug!`,
		targetTemplate: (a, t) => `${a} gives ${t} a warm, fluffy hug!`,
	},
	pat: {
		action: 'pat',
		label: 'Headpat',
		selfTemplate: (a) => `${a} pats their own head gently.`,
		targetTemplate: (a, t) => `${a} gives ${t} gentle Neko headpats!`,
	},
	poke: {
		action: 'poke',
		label: 'Poke',
		selfTemplate: (a) => `${a} pokes their own cheek curiously.`,
		targetTemplate: (a, t) => `${a} playfully pokes ${t}!`,
	},
	bonk: {
		action: 'bonk',
		label: 'Bonk',
		selfTemplate: (a) => `${a} bonks themselves on the head!`,
		targetTemplate: (a, t) => `${a} bonks ${t} with a rolled-up manga volume!`,
	},
	blush: {
		action: 'blush',
		label: 'Blush',
		selfTemplate: (a) => `${a}'s ears twitch as they blush brightly!`,
		targetTemplate: (a, t) => `${a} blushes brightly while looking at ${t}!`,
	},
	wave: {
		action: 'wave',
		label: 'Wave',
		selfTemplate: (a) => `${a} waves cheerfully to the room!`,
		targetTemplate: (a, t) => `${a} waves energetically at ${t}!`,
	},
	highfive: {
		action: 'highfive',
		label: 'High-Five',
		selfTemplate: (a) => `${a} claps their paws together in celebration!`,
		targetTemplate: (a, t) => `${a} gives ${t} a crisp high-five!`,
	},
	smile: {
		action: 'smile',
		label: 'Smile',
		selfTemplate: (a) => `${a} beams with a bright anime smile!`,
		targetTemplate: (a, t) => `${a} shares a warm smile with ${t}!`,
	},
	cuddle: {
		action: 'cuddle',
		label: 'Cuddle',
		selfTemplate: (a) => `${a} curls up like a sleepy kotatsu cat!`,
		targetTemplate: (a, t) => `${a} cuddles up right next to ${t}!`,
	},
	slap: {
		action: 'slap',
		label: 'Playful Slap',
		selfTemplate: (a) => `${a} slaps their own cheeks to wake up!`,
		targetTemplate: (a, t) => `${a} delivers a dramatic anime slap to ${t}!`,
	},
};

export interface SocialGifResult {
	url: string;
	animeName: string;
	provider: 'NEKOSBEST' | 'OTAKUGIFS';
}

const nekosBestHttp = ky.create({
	prefixUrl: 'https://nekos.best/api/v2',
	timeout: 2_500,
	retry: 0,
});

const otakuGifsHttp = ky.create({
	prefixUrl: 'https://api.otakugifs.xyz',
	timeout: 2_500,
	retry: 0,
});

export async function fetchSocialGif(action: SocialActionType): Promise<SocialGifResult> {
	return withCircuitBreaker<SocialGifResult>(
		'nekosbest',
		async () => {
			const nekosEndpoint = action === 'bonk' ? 'slap' : action;
			const res = await nekosBestHttp.get(nekosEndpoint, { searchParams: { amount: '1' } }).json<{
				results?: Array<{ url?: string; anime_name?: string }>;
			}>();

			const item = res.results?.[0];
			if (!item?.url) {
				throw new Error('Empty NekosBest response');
			}

			return {
				url: item.url,
				animeName: item.anime_name ?? 'Anime Reaction',
				provider: 'NEKOSBEST',
			};
		},
		async () => {
			const res = await otakuGifsHttp
				.get('gif', { searchParams: { reaction: action } })
				.json<{ url?: string }>()
				.catch(() => ({ url: undefined }));

			return {
				url: res.url ?? 'https://nekos.best/api/v2/pat/001.gif',
				animeName: 'OtakuGIFs Collection',
				provider: 'OTAKUGIFS',
			};
		},
	);
}
