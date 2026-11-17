import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { type ButtonInteraction, MessageFlags } from 'discord.js';
import { desc, eq, sql } from 'drizzle-orm';
import {
	ANIME_TRIVIA_BANK,
	type MatsuriHubTab,
	buildMatsuriCardContainer,
	drawWeightedOmikuji,
} from '../../commands/matsuri/matsuri.ts';
import { db } from '../../db/index.ts';
import { users } from '../../db/schema/index.ts';
import { formatStatus } from '../../lib/cv2/TimeAndStatus.ts';
import { checkAndSetCooldown } from '../../lib/redis.ts';

export class MatsuriHubHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.MessageComponent,
		});
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith('mat:')) {
			return this.none();
		}
		return this.some();
	}

	public override async run(interaction: ButtonInteraction): Promise<void> {
		const validation = this.container.cv2.validateInteractionAccess(
			interaction.customId,
			interaction.user.id,
		);

		if (!validation.ok) {
			await this.container.cv2.notify(interaction, {
				status: validation.reason === 'NOT_OWNER' ? 'ACCESS DENIED' : 'EXPIRED',
				title:
					validation.reason === 'NOT_OWNER'
						? 'Matsuri Booth Locked to Owner'
						: 'Matsuri Session Expired',
				message:
					validation.reason === 'NOT_OWNER'
						? 'Run `/matsuri` to open your own personal festival & shrine hub.'
						: 'This festival booth session expired. Run `/matsuri` again to continue.',
				ephemeral: true,
			});
			return;
		}

		const { action, ownerId, state, extra, createdAtMs } = validation.data;
		const lock = await this.container.context.acquireActionLock(ownerId);
		if (!lock.acquired) return;

		try {
			const ctx = await this.container.context.getUserContext(ownerId);
			let tab: MatsuriHubTab = 'shrine';
			let boothResultText: string | undefined;
			let triviaResultText: string | undefined;
			let footerNotice: string | undefined;
			let nextTrivia = ANIME_TRIVIA_BANK[0]!;

			if (action === 'tab') {
				tab = (state as MatsuriHubTab) || 'shrine';
			} else if (action === 'pray') {
				tab = 'shrine';
				const cd = await checkAndSetCooldown(`shrine_pray:${ownerId}`, 86_400_000);
				if (cd.onCooldown) {
					await this.container.cv2.notify(interaction, {
						status: 'COOLDOWN',
						title: 'Daily Ema Already Hung',
						message: `You can offer another daily Shrine prayer in **${this.container.cv2.formatDurationCompact(cd.remainingMs)}** (${this.container.cv2.discordTime(cd.expiresAtUnix, 'R')}).`,
						ephemeral: true,
					});
					return;
				}

				const nextStreak = ctx.user.shrineStreak + 1;
				const coinReward = 200 + nextStreak * 35;
				const shardReward = 5 + Math.min(10, nextStreak);
				const now = new Date();

				ctx.user.shrineStreak = nextStreak;
				ctx.user.lastShrineCheckinAt = now;
				ctx.user.coins += coinReward;
				ctx.user.shards += shardReward;
				ctx.user.matsuriPoints += 30;

				await db
					.update(users)
					.set({
						shrineStreak: nextStreak,
						lastShrineCheckinAt: now,
						coins: sql`${users.coins} + ${coinReward}`,
						shards: sql`${users.shards} + ${shardReward}`,
						matsuriPoints: sql`${users.matsuriPoints} + 30`,
						updatedAt: now,
					})
					.where(eq(users.id, ownerId))
					.catch(() => {});

				footerNotice = `Shrine Streak Day ${nextStreak}! Earned +${coinReward} Coins & +${shardReward} Shards`;
			} else if (action === 'omikuji') {
				tab = 'shrine';
				const cost = 100;
				if (ctx.user.coins < cost) return;

				const fortune = drawWeightedOmikuji();
				const expiresAt = new Date(Date.now() + 86_400_000);
				ctx.user.coins -= cost;
				ctx.user.omikujiFortune = fortune.id;
				ctx.user.omikujiExpiresAt = expiresAt;

				await db
					.update(users)
					.set({
						coins: sql`${users.coins} - ${cost}`,
						omikujiFortune: fortune.id,
						omikujiExpiresAt: expiresAt,
						updatedAt: new Date(),
					})
					.where(eq(users.id, ownerId))
					.catch(() => {});

				footerNotice = `Drew Omikuji: ${fortune.name} [${fortune.statusTag}]`;
			} else if (action === 'cleanse') {
				tab = 'shrine';
				const cleanseCost = 150;
				if (ctx.user.coins < cleanseCost) return;

				ctx.user.coins -= cleanseCost;
				ctx.user.omikujiFortune = 'KICHI';
				await db
					.update(users)
					.set({
						coins: sql`${users.coins} - ${cleanseCost}`,
						omikujiFortune: 'KICHI',
						updatedAt: new Date(),
					})
					.where(eq(users.id, ownerId))
					.catch(() => {});

				footerNotice =
					'Tied Kyou slip to the sacred pine tree! Curse cleansed into Kichi (+5% XP/Coins)';
			} else if (action === 'booth') {
				tab = 'booths';
				const fee = 100;
				if (ctx.user.coins < fee) return;

				const roll = Math.random();
				const baseWin = roll > 0.25 ? 180 + Math.floor(roll * 260) : 40;
				const netCoins = baseWin - fee;
				const pts = roll > 0.25 ? 35 : 10;
				const shardDrop = roll > 0.8 ? 3 : 0;

				ctx.user.coins += netCoins;
				ctx.user.matsuriPoints += pts;
				ctx.user.shards += shardDrop;

				await db
					.update(users)
					.set({
						coins: sql`${users.coins} + ${netCoins}`,
						matsuriPoints: sql`${users.matsuriPoints} + ${pts}`,
						shards: shardDrop > 0 ? sql`${users.shards} + ${shardDrop}` : ctx.user.shards,
						updatedAt: new Date(),
					})
					.where(eq(users.id, ownerId))
					.catch(() => {});

				const boothName =
					state === 'goldfish'
						? 'Goldfish Scooping'
						: state === 'lantern'
							? 'Lantern Toss'
							: 'Taiko Rhythm';
				const shardNote = shardDrop > 0 ? ` + **${shardDrop} Bonus Shards**` : '';
				boothResultText = `${formatStatus('CONFIRMED')} **${boothName}:** Won **${baseWin} Coins** (Net \`${netCoins >= 0 ? '+' : ''}${netCoins} Coins\`), **+${pts} Matsuri Points**${shardNote}!`;
				footerNotice = `Played ${boothName} (+${pts} Matsuri Pts)`;
			} else if (action === 'ans') {
				tab = 'trivia';
				const currentQ = ANIME_TRIVIA_BANK.find((q) => q.id === extra) ?? ANIME_TRIVIA_BANK[0]!;
				const pickedIdx = Number.parseInt(state, 10);
				const isCorrect = pickedIdx === currentQ.correctIndex;

				const currentIndex = ANIME_TRIVIA_BANK.findIndex((q) => q.id === currentQ.id);
				nextTrivia = ANIME_TRIVIA_BANK[(currentIndex + 1) % ANIME_TRIVIA_BANK.length]!;

				if (isCorrect) {
					ctx.user.coins += 220;
					ctx.user.shards += 3;
					ctx.user.matsuriPoints += 25;

					await db
						.update(users)
						.set({
							coins: sql`${users.coins} + 220`,
							shards: sql`${users.shards} + 3`,
							matsuriPoints: sql`${users.matsuriPoints} + 25`,
							updatedAt: new Date(),
						})
						.where(eq(users.id, ownerId))
						.catch(() => {});

					triviaResultText = `${formatStatus('CONFIRMED')} **Correct!** "${currentQ.options[currentQ.correctIndex]}" — Earned **+220 Coins**, **+3 Shards**, and **+25 Matsuri Points**!`;
					footerNotice = 'Trivia Answer Correct (+220 Coins & +3 Shards)';
				} else {
					triviaResultText = `${formatStatus('CANCELLED')} **Incorrect!** The correct answer for *${currentQ.series}* was **${currentQ.options[currentQ.correctIndex]}**.`;
					footerNotice = 'Trivia Answer Missed — Next Question Loaded';
				}
			}

			const leaderboardRows =
				tab === 'leaderboard'
					? await db
							.select()
							.from(users)
							.orderBy(desc(users.matsuriPoints), desc(users.level))
							.limit(10)
							.catch(() => [ctx.user])
					: undefined;

			const container = buildMatsuriCardContainer({
				ownerId,
				ctx,
				tab,
				boothResultText,
				triviaQuestion: nextTrivia,
				triviaResultText,
				leaderboardRows,
				footerNotice,
				createdAtMs,
			});

			await interaction.update({
				flags: MessageFlags.IsComponentsV2,
				components: [container],
			});
		} finally {
			await lock.release();
		}
	}
}
