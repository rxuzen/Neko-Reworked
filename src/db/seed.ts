export interface ShopItemDefinition {
	id: string;
	name: string;
	category: 'BOOST' | 'UPGRADE' | 'SNACK' | 'COSMETIC' | 'TITLE';
	priceCoins: number;
	priceGems: number;
	description: string;
	xpMultiplierBonus?: number;
	coinMultiplierBonus?: number;
	vaultCapacityBonus?: number;
	affectionBonus?: number;
	durationSeconds?: number;
	titleText?: string;
}

export interface CareerDefinition {
	id: string;
	name: string;
	minUserLevel: number;
	baseCoins: number;
	baseXp: number;
	cooldownSeconds: number;
	description: string;
}

export interface ExpeditionZoneDefinition {
	id: string;
	name: string;
	minBondLevel: number;
	durationSeconds: number;
	minShards: number;
	maxShards: number;
	snackDropChance: number;
	description: string;
}

export interface OmikujiFortuneDefinition {
	id: 'DAI_KICHI' | 'CHU_KICHI' | 'SHO_KICHI' | 'KICHI' | 'KYOU';
	name: string;
	statusTag: 'BLESSED' | 'CURSED';
	weight: number;
	xpBonus: number;
	coinBonus: number;
	gachaLuckBonus: number;
	cleanseCostCoins: number;
	description: string;
}

export const SHOP_CATALOG: readonly ShopItemDefinition[] = [
	{
		id: 'matcha_taiyaki',
		name: 'Matcha Taiyaki',
		category: 'SNACK',
		priceCoins: 250,
		priceGems: 0,
		affectionBonus: 50,
		description:
			'Warm crispy fish-shaped pastry filled with sweet matcha cream (+50 Companion AFF).',
	},
	{
		id: 'strawberry_daifuku',
		name: 'Strawberry Daifuku',
		category: 'SNACK',
		priceCoins: 500,
		priceGems: 0,
		affectionBonus: 120,
		description:
			'Soft mochi stuffed with sweet red bean paste and a fresh strawberry (+120 Companion AFF).',
	},
	{
		id: 'golden_konpeito',
		name: 'Golden Konpeito Jar',
		category: 'SNACK',
		priceCoins: 0,
		priceGems: 15,
		affectionBonus: 350,
		description: 'Star-shaped sugar candies infused with shrine stardust (+350 Companion AFF).',
	},
	{
		id: 'ramune_xp_tonic',
		name: 'Festival Ramune Tonic (2h)',
		category: 'BOOST',
		priceCoins: 1_200,
		priceGems: 0,
		xpMultiplierBonus: 0.35,
		durationSeconds: 7_200,
		description: 'Grants +35% XP gain across chat and career shifts for 2 hours.',
	},
	{
		id: 'maneki_coin_charm',
		name: 'Maneki-Neko Coin Charm (2h)',
		category: 'BOOST',
		priceCoins: 1_500,
		priceGems: 0,
		coinMultiplierBonus: 0.35,
		durationSeconds: 7_200,
		description: 'Grants +35% Coin payouts on work shifts and Matsuri booths for 2 hours.',
	},
	{
		id: 'perm_xp_scroll_i',
		name: 'Shrine Wisdom Scroll I',
		category: 'UPGRADE',
		priceCoins: 12_500,
		priceGems: 0,
		xpMultiplierBonus: 0.15,
		description: 'Permanently increases your base XP multiplier by +15%.',
	},
	{
		id: 'perm_coin_ledger_i',
		name: 'Merchant Guild Ledger I',
		category: 'UPGRADE',
		priceCoins: 15_000,
		priceGems: 0,
		coinMultiplierBonus: 0.15,
		description: 'Permanently increases your base Coin multiplier by +15%.',
	},
	{
		id: 'vault_expansion_i',
		name: 'Ironclad Vault Seal',
		category: 'UPGRADE',
		priceCoins: 8_000,
		priceGems: 0,
		vaultCapacityBonus: 15_000,
		description: 'Permanently expands your anti-rob Vault capacity by +15,000 Coins.',
	},
	{
		id: 'title_shrine_guardian',
		name: 'Title: [ NEKO ] Shrine Guardian',
		category: 'TITLE',
		priceCoins: 25_000,
		priceGems: 0,
		titleText: '[ NEKO ] Shrine Guardian',
		description: 'Unlocks the prestigious [ NEKO ] Shrine Guardian profile title.',
	},
	{
		id: 'title_akiba_phantom',
		name: 'Title: [ NEKO ] Akiba Phantom',
		category: 'TITLE',
		priceCoins: 0,
		priceGems: 100,
		titleText: '[ NEKO ] Akiba Phantom',
		description: 'Unlocks the exclusive [ NEKO ] Akiba Phantom profile title.',
	},
] as const;

export const CAREER_CATALOG: readonly CareerDefinition[] = [
	{
		id: 'konbini_clerk',
		name: 'Konbini Night Clerk',
		minUserLevel: 1,
		baseCoins: 180,
		baseXp: 45,
		cooldownSeconds: 1_800,
		description: 'Restock onigiri shelves and ring up late-night customers.',
	},
	{
		id: 'maid_cafe_server',
		name: 'Akihabara Cafe Barista',
		minUserLevel: 5,
		baseCoins: 340,
		baseXp: 75,
		cooldownSeconds: 2_700,
		description: 'Cast deliciousness spells on omurice and serve espresso.',
	},
	{
		id: 'manga_assistant',
		name: 'Weekly Manga Inker',
		minUserLevel: 15,
		baseCoins: 620,
		baseXp: 130,
		cooldownSeconds: 3_600,
		description: 'Apply screentones and ink action backgrounds before the print deadline.',
	},
	{
		id: 'seiyuu_voice_actor',
		name: 'Lead Anime Seiyuu',
		minUserLevel: 30,
		baseCoins: 1_150,
		baseXp: 240,
		cooldownSeconds: 5_400,
		description: 'Record dramatic studio voice lines for seasonal anime protagonists.',
	},
	{
		id: 'animation_director',
		name: 'Sakuga Key Animator',
		minUserLevel: 50,
		baseCoins: 2_100,
		baseXp: 420,
		cooldownSeconds: 7_200,
		description: 'Direct flagship climax episodes at a premier Tokyo animation studio.',
	},
] as const;

export const EXPEDITION_ZONES: readonly ExpeditionZoneDefinition[] = [
	{
		id: 'yanaka_cat_street',
		name: 'Yanaka Ginza Cat Street',
		minBondLevel: 1,
		durationSeconds: 3_600,
		minShards: 12,
		maxShards: 25,
		snackDropChance: 0.25,
		description: 'A nostalgic sunset stroll along Tokyo’s famous cat alleyway (1h Outing).',
	},
	{
		id: 'akihabara_arcade',
		name: 'Akihabara Arcade District',
		minBondLevel: 5,
		durationSeconds: 14_400,
		minShards: 35,
		maxShards: 65,
		snackDropChance: 0.45,
		description: 'Scour retro crane machines and gachapon alleys for rare shards (4h Outing).',
	},
	{
		id: 'fushimi_inari_torii',
		name: 'Fushimi Inari Torii Trails',
		minBondLevel: 12,
		durationSeconds: 28_800,
		minShards: 75,
		maxShards: 130,
		snackDropChance: 0.65,
		description:
			'Ascend the thousand vermilion torii gates in search of sacred relics (8h Outing).',
	},
] as const;

export const OMIKUJI_FORTUNES: readonly OmikujiFortuneDefinition[] = [
	{
		id: 'DAI_KICHI',
		name: 'Dai-Kichi (Great Blessing)',
		statusTag: 'BLESSED',
		weight: 12,
		xpBonus: 0.2,
		coinBonus: 0.2,
		gachaLuckBonus: 0.1,
		cleanseCostCoins: 0,
		description: 'Supreme shrine blessing! +20% XP, +20% Coins, and +10% Gacha SSR rate for 24h.',
	},
	{
		id: 'CHU_KICHI',
		name: 'Chu-Kichi (Middle Blessing)',
		statusTag: 'BLESSED',
		weight: 28,
		xpBonus: 0.12,
		coinBonus: 0.12,
		gachaLuckBonus: 0.05,
		cleanseCostCoins: 0,
		description: 'Warm fortune! +12% XP, +12% Coins, and +5% Gacha SSR rate for 24h.',
	},
	{
		id: 'SHO_KICHI',
		name: 'Sho-Kichi (Small Blessing)',
		statusTag: 'BLESSED',
		weight: 32,
		xpBonus: 0.08,
		coinBonus: 0.08,
		gachaLuckBonus: 0,
		cleanseCostCoins: 0,
		description: 'Gentle breeze of luck! +8% XP and +8% Coins for 24h.',
	},
	{
		id: 'KICHI',
		name: 'Kichi (Modest Blessing)',
		statusTag: 'BLESSED',
		weight: 18,
		xpBonus: 0.05,
		coinBonus: 0.05,
		gachaLuckBonus: 0,
		cleanseCostCoins: 0,
		description: 'Peaceful day ahead. +5% XP and +5% Coins for 24h.',
	},
	{
		id: 'KYOU',
		name: 'Kyou (Curse)',
		statusTag: 'CURSED',
		weight: 10,
		xpBonus: -0.1,
		coinBonus: -0.1,
		gachaLuckBonus: 0,
		cleanseCostCoins: 150,
		description:
			'Clouded omen (-10% XP/Coins). Tie this slip to the shrine pine tree to cleanse it!',
	},
] as const;
