import ky from 'ky';
import { getOrSetCache, withCircuitBreaker } from '../lib/cache.ts';

export interface PokemonGachaEntry {
	id: number;
	name: string;
	types: string[];
	hp: number;
	atk: number;
	def: number;
	spd: number;
	bst: number;
	rarity: 'UR' | 'SSR' | 'SR' | 'R';
	spriteUrl: string;
	shinySpriteUrl: string;
}

const CURATED_POKEMON_POOL: readonly PokemonGachaEntry[] = [
	{
		id: 384,
		name: 'Rayquaza',
		types: ['Dragon', 'Flying'],
		hp: 105,
		atk: 150,
		def: 90,
		spd: 95,
		bst: 680,
		rarity: 'UR',
		spriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/384.png',
		shinySpriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/384.png',
	},
	{
		id: 150,
		name: 'Mewtwo',
		types: ['Psychic'],
		hp: 106,
		atk: 110,
		def: 90,
		spd: 130,
		bst: 680,
		rarity: 'UR',
		spriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/150.png',
		shinySpriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/150.png',
	},
	{
		id: 445,
		name: 'Garchomp',
		types: ['Dragon', 'Ground'],
		hp: 108,
		atk: 130,
		def: 95,
		spd: 102,
		bst: 600,
		rarity: 'UR',
		spriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/445.png',
		shinySpriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/445.png',
	},
	{
		id: 448,
		name: 'Lucario',
		types: ['Fighting', 'Steel'],
		hp: 70,
		atk: 110,
		def: 70,
		spd: 90,
		bst: 525,
		rarity: 'SSR',
		spriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/448.png',
		shinySpriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/448.png',
	},
	{
		id: 282,
		name: 'Gardevoir',
		types: ['Psychic', 'Fairy'],
		hp: 68,
		atk: 65,
		def: 65,
		spd: 80,
		bst: 518,
		rarity: 'SSR',
		spriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/282.png',
		shinySpriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/282.png',
	},
	{
		id: 658,
		name: 'Greninja',
		types: ['Water', 'Dark'],
		hp: 72,
		atk: 95,
		def: 67,
		spd: 122,
		bst: 530,
		rarity: 'SSR',
		spriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/658.png',
		shinySpriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/658.png',
	},
	{
		id: 700,
		name: 'Sylveon',
		types: ['Fairy'],
		hp: 95,
		atk: 65,
		def: 65,
		spd: 60,
		bst: 525,
		rarity: 'SSR',
		spriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/700.png',
		shinySpriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/700.png',
	},
	{
		id: 778,
		name: 'Mimikyu',
		types: ['Ghost', 'Fairy'],
		hp: 55,
		atk: 90,
		def: 80,
		spd: 96,
		bst: 476,
		rarity: 'SR',
		spriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/778.png',
		shinySpriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/778.png',
	},
	{
		id: 197,
		name: 'Umbreon',
		types: ['Dark'],
		hp: 95,
		atk: 65,
		def: 110,
		spd: 65,
		bst: 525,
		rarity: 'SR',
		spriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/197.png',
		shinySpriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/197.png',
	},
	{
		id: 25,
		name: 'Pikachu',
		types: ['Electric'],
		hp: 35,
		atk: 55,
		def: 40,
		spd: 90,
		bst: 320,
		rarity: 'R',
		spriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
		shinySpriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/25.png',
	},
	{
		id: 133,
		name: 'Eevee',
		types: ['Normal'],
		hp: 55,
		atk: 55,
		def: 50,
		spd: 55,
		bst: 325,
		rarity: 'R',
		spriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png',
		shinySpriteUrl:
			'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/133.png',
	},
] as const;

const pokeHttp = ky.create({
	prefixUrl: 'https://pokeapi.co/api/v2',
	timeout: 2_500,
	retry: 0,
});

export function derivePokemonRarityFromBst(bst: number): 'UR' | 'SSR' | 'SR' | 'R' {
	if (bst >= 600) return 'UR';
	if (bst >= 515) return 'SSR';
	if (bst >= 430) return 'SR';
	return 'R';
}

export function getCuratedPokemonByRarity(rarity: 'UR' | 'SSR' | 'SR' | 'R'): PokemonGachaEntry {
	const matches = CURATED_POKEMON_POOL.filter((p) => p.rarity === rarity);
	if (matches.length === 0) return CURATED_POKEMON_POOL[0]!;
	return matches[Math.floor(Math.random() * matches.length)]!;
}

export async function fetchPokemonById(dexId: number): Promise<PokemonGachaEntry> {
	return getOrSetCache(
		`poke:dex:${dexId}`,
		async () =>
			withCircuitBreaker(
				'pokeapi',
				async () => {
					const data = await pokeHttp.get(`pokemon/${dexId}`).json<{
						id: number;
						name: string;
						types?: Array<{ type?: { name?: string } }>;
						stats?: Array<{ base_stat?: number; stat?: { name?: string } }>;
					}>();

					const statMap = new Map<string, number>();
					let bst = 0;
					for (const s of data.stats ?? []) {
						const val = s.base_stat ?? 50;
						bst += val;
						if (s.stat?.name) statMap.set(s.stat.name, val);
					}

					const formattedName = data.name.charAt(0).toUpperCase() + data.name.slice(1);
					const types = (data.types ?? []).map((t) => {
						const raw = t.type?.name ?? 'Normal';
						return raw.charAt(0).toUpperCase() + raw.slice(1);
					});

					return {
						id: data.id,
						name: formattedName,
						types: types.length > 0 ? types : ['Normal'],
						hp: statMap.get('hp') ?? 60,
						atk: statMap.get('attack') ?? 60,
						def: statMap.get('defense') ?? 60,
						spd: statMap.get('speed') ?? 60,
						bst,
						rarity: derivePokemonRarityFromBst(bst),
						spriteUrl: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${data.id}.png`,
						shinySpriteUrl: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${data.id}.png`,
					};
				},
				async () => {
					const found = CURATED_POKEMON_POOL.find((p) => p.id === dexId);
					return found ?? CURATED_POKEMON_POOL[0]!;
				},
			),
		{ l1TtlMs: 60_000, l2TtlSeconds: 86_400 },
	);
}
