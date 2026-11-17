import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { type ButtonInteraction, MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { and, eq } from 'drizzle-orm';
import {
	type AnimeCardTab,
	AnimeCommand,
	buildAnimeCardContainer,
} from '../../commands/media/anime.ts';
import {
	type CharacterCardTab,
	buildCharacterCardContainer,
	lookupCharacterGachaStatus,
} from '../../commands/media/character.ts';
import { type MangaCardTab, buildMangaCardContainer } from '../../commands/media/manga.ts';
import { buildSauceCardContainer } from '../../commands/media/sauce.ts';
import {
	type ScheduleCardTab,
	buildScheduleCardContainer,
	fetchUserWatchlist,
} from '../../commands/media/schedule.ts';
import { buildSocialCardContainer } from '../../commands/social/social.ts';
import { db } from '../../db/index.ts';
import { companions, gachaCards, gachaWishlists, watchlists } from '../../db/schema/index.ts';
import { l1Cache } from '../../lib/cache.ts';
import {
	getAiringSchedule,
	getAnimeByIdOrSearch,
	getCharacterByIdOrSearch,
	getMangaByIdOrSearch,
} from '../../services/anilist.service.ts';
import {
	SOCIAL_ACTIONS,
	type SocialActionType,
	fetchSocialGif,
} from '../../services/media.service.ts';
import type { SauceMatchResult } from '../../services/tracemoe.service.ts';

const MEDIA_DOMAINS = new Set(['ani', 'mng', 'chr', 'sch', 'sce', 'soc']);

export class MediaComponentHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.MessageComponent,
		});
	}

	public override parse(interaction: ButtonInteraction | StringSelectMenuInteraction) {
		const prefix = interaction.customId.split(':')[0] ?? '';
		if (!MEDIA_DOMAINS.has(prefix)) {
			return this.none();
		}
		return this.some();
	}

	public override async run(
		interaction: ButtonInteraction | StringSelectMenuInteraction,
	): Promise<void> {
		const validation = this.container.cv2.validateInteractionAccess(
			interaction.customId,
			interaction.user.id,
		);

		if (!validation.ok) {
			await this.container.cv2.notify(interaction, {
				status: validation.reason === 'NOT_OWNER' ? 'ACCESS DENIED' : 'EXPIRED',
				title:
					validation.reason === 'NOT_OWNER'
						? 'Card Controlled by Another User'
						: 'Card Interaction Expired',
				message:
					validation.reason === 'NOT_OWNER'
						? 'Only the user who ran this lookup can switch tabs or modify settings on this card.'
						: 'This interactive card expired after 14 minutes. Run the command again for a fresh card.',
				ephemeral: true,
			});
			return;
		}

		const { domain, action, ownerId, state, extra, createdAtMs } = validation.data;
		const ctx = await this.container.context.getUserContext(ownerId);

		// 1. /anime tabs & watchlist/notify toggles
		if (domain === 'ani') {
			const anime = await getAnimeByIdOrSearch(extra);
			if (!anime) return;

			let inWatchlist = false;
			let notifyOnAir = false;

			if (action === 'watch' || action === 'notify') {
				const lock = await this.container.context.acquireActionLock(ownerId);
				if (!lock.acquired) return;
				try {
					if (action === 'watch') {
						if (state === 'add') {
							await db
								.insert(watchlists)
								.values({
									userId: ownerId,
									guildId: interaction.guildId,
									anilistId: anime.id,
									titleRomaji: anime.titleRomaji,
									titleEnglish: anime.titleEnglish,
									notifyOnAir: true,
								})
								.onConflictDoNothing()
								.catch(() => {});
							inWatchlist = true;
							notifyOnAir = true;
						} else {
							await db
								.delete(watchlists)
								.where(and(eq(watchlists.userId, ownerId), eq(watchlists.anilistId, anime.id)))
								.catch(() => {});
							inWatchlist = false;
						}
					} else if (action === 'notify') {
						notifyOnAir = state === 'on';
						inWatchlist = true;
						await db
							.insert(watchlists)
							.values({
								userId: ownerId,
								guildId: interaction.guildId,
								anilistId: anime.id,
								titleRomaji: anime.titleRomaji,
								titleEnglish: anime.titleEnglish,
								notifyOnAir,
							})
							.onConflictDoUpdate({
								target: [watchlists.userId, watchlists.anilistId],
								set: { notifyOnAir },
							})
							.catch(() => {});
					}
				} finally {
					await lock.release();
				}
			}

			const tab: AnimeCardTab = action === 'tab' ? (state as AnimeCardTab) : 'overview';
			const themes = tab === 'themes' ? await AnimeCommand.fetchThemesForTab(anime.id) : undefined;

			const container = buildAnimeCardContainer({
				ownerId,
				anime,
				tab,
				titleMode: ctx.settings.titleLanguage,
				inWatchlist,
				notifyOnAir,
				themes,
				createdAtMs,
			});

			await interaction.update({
				flags: MessageFlags.IsComponentsV2,
				components: [container],
			});
			return;
		}

		// 2. /manga tabs
		if (domain === 'mng') {
			const manga = await getMangaByIdOrSearch(extra);
			if (!manga) return;

			const container = buildMangaCardContainer({
				ownerId,
				manga,
				tab: (state as MangaCardTab) || 'overview',
				titleMode: ctx.settings.titleLanguage,
				createdAtMs,
			});

			await interaction.update({
				flags: MessageFlags.IsComponentsV2,
				components: [container],
			});
			return;
		}

		// 3. /character tabs, wishlist toggle & equip companion
		if (domain === 'chr') {
			const character = await getCharacterByIdOrSearch(extra);
			if (!character) return;

			if (action === 'wish' || action === 'equip') {
				const lock = await this.container.context.acquireActionLock(ownerId);
				if (!lock.acquired) return;
				try {
					if (action === 'wish') {
						if (state === 'add') {
							await db
								.insert(gachaWishlists)
								.values({
									userId: ownerId,
									banner: 'ANILIST',
									slot: 1,
									externalId: character.id,
									name: character.nameFull,
								})
								.onConflictDoUpdate({
									target: [gachaWishlists.userId, gachaWishlists.banner, gachaWishlists.slot],
									set: {
										externalId: character.id,
										name: character.nameFull,
									},
								})
								.catch(() => {});
						} else {
							await db
								.delete(gachaWishlists)
								.where(
									and(
										eq(gachaWishlists.userId, ownerId),
										eq(gachaWishlists.banner, 'ANILIST'),
										eq(gachaWishlists.externalId, character.id),
									),
								)
								.catch(() => {});
						}
					} else if (action === 'equip') {
						const ownedRows = await db
							.select()
							.from(gachaCards)
							.where(
								and(
									eq(gachaCards.userId, ownerId),
									eq(gachaCards.banner, 'ANILIST'),
									eq(gachaCards.externalId, character.id),
								),
							)
							.limit(1)
							.catch(() => []);
						const card = ownedRows[0];
						if (card) {
							await db
								.update(companions)
								.set({
									partnerName: card.name,
									partnerRarity: card.rarity,
									partnerStars: card.stars,
									partnerImageUrl: card.imageUrl,
									gachaCardId: card.id,
									updatedAt: new Date(),
								})
								.where(eq(companions.userId, ownerId))
								.catch(() => {});
						}
					}
				} finally {
					await lock.release();
				}
			}

			const gachaStatus = await lookupCharacterGachaStatus(
				ownerId,
				character.id,
				character.favourites,
			);
			const tab: CharacterCardTab = action === 'tab' ? (state as CharacterCardTab) : 'overview';

			const container = buildCharacterCardContainer({
				ownerId,
				character,
				tab,
				gachaStatus,
				createdAtMs,
			});

			await interaction.update({
				flags: MessageFlags.IsComponentsV2,
				components: [container],
			});
			return;
		}

		// 4. /schedule tabs
		if (domain === 'sch') {
			const tab = (state as ScheduleCardTab) || 'today';
			const nowUnix = Math.floor(Date.now() / 1_000);
			const windowSeconds = tab === 'today' ? 86_400 : 3 * 86_400;

			const [entries, watchlistItems] = await Promise.all([
				getAiringSchedule(nowUnix - 3_600, nowUnix + windowSeconds),
				fetchUserWatchlist(ownerId),
			]);

			const container = buildScheduleCardContainer({
				ownerId,
				tab,
				entries,
				watchlistItems,
				timezone: ctx.settings.timezone,
				titleMode: ctx.settings.titleLanguage,
				createdAtMs,
			});

			await interaction.update({
				flags: MessageFlags.IsComponentsV2,
				components: [container],
			});
			return;
		}

		// 5. /sauce pagination
		if (domain === 'sce') {
			const matches =
				(l1Cache.get(`sauce_session:${extra}`) as SauceMatchResult[] | undefined) ?? [];
			const nextIndex = Number.parseInt(state, 10) || 0;

			const container = buildSauceCardContainer({
				ownerId,
				queryHash: extra,
				matches,
				index: nextIndex,
				createdAtMs,
			});

			await interaction.update({
				flags: MessageFlags.IsComponentsV2,
				components: [container],
			});
			return;
		}

		// 6. /social & Quick Social Action
		if (domain === 'soc') {
			let selectedAction: SocialActionType = SOCIAL_ACTIONS.includes(state as SocialActionType)
				? (state as SocialActionType)
				: 'hug';

			if ((action === 'switch' || action === 'ctxsend') && interaction.isStringSelectMenu()) {
				const picked = interaction.values[0] as SocialActionType | undefined;
				if (picked && SOCIAL_ACTIONS.includes(picked)) {
					selectedAction = picked;
				}
			}

			const gif = await fetchSocialGif(selectedAction);
			const container = buildSocialCardContainer({
				ownerId,
				actorId: ownerId,
				targetId: extra && extra !== '_' ? extra : null,
				action: selectedAction,
				gif,
				createdAtMs,
			});

			if (action === 'ctxsend') {
				await interaction.reply({
					flags: MessageFlags.IsComponentsV2,
					components: [container],
				});
				return;
			}

			await interaction.update({
				flags: MessageFlags.IsComponentsV2,
				components: [container],
			});
		}
	}
}
