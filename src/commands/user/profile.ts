import { Command } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ContainerBuilder,
	type MessageActionRowComponentBuilder,
	MessageFlags,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	UserSelectMenuBuilder,
} from 'discord.js';
import { PROGRESSION_LIMITS } from '../../config/constants.ts';
import { CAREER_CATALOG, EXPEDITION_ZONES, OMIKUJI_FORTUNES } from '../../db/seed.ts';
import { encodeCustomId } from '../../lib/cv2/CustomId.ts';
import {
	formatAlignedRows,
	formatProgressBar,
	formatStarRating,
} from '../../lib/cv2/Formatters.ts';
import { type NekoFieldOption, createNekoContainer } from '../../lib/cv2/NekoLayout.ts';
import { formatCountdown, formatStatus, statusFooter } from '../../lib/cv2/TimeAndStatus.ts';
import {
	type HydratedUserContext,
	calculateRequiredXpForLevel,
} from '../../utilities/ContextUtility.ts';

export type ProfileHubTab = 'overview' | 'companion' | 'career' | 'customize';

export const DEFAULT_TITLES = [
	'[ NEKO ] Stray Kitten',
	'[ NEKO ] Shrine Visitor',
	'[ NEKO ] Festival Regular',
	'[ NEKO ] Shrine Guardian',
	'[ NEKO ] Akiba Phantom',
] as const;

export function calculateRequiredAffectionForBond(bondLevel: number): number {
	const clamped = Math.max(1, Math.min(PROGRESSION_LIMITS.MAX_COMPANION_BOND_LEVEL, bondLevel));
	return Math.floor(150 * clamped ** 1.3);
}

export interface BuildProfileCardOptions {
	ownerId: string;
	targetUserId: string;
	targetUsername: string;
	targetAvatarUrl?: string;
	ctx: HydratedUserContext;
	tab: ProfileHubTab;
	unlockedTitles?: readonly string[];
	footerNotice?: string;
	nowMs?: number;
	createdAtMs?: number;
}

export function buildProfileCardContainer(options: BuildProfileCardOptions): ContainerBuilder {
	const createdAtMs = options.createdAtMs ?? Date.now();
	const nowMs = options.nowMs ?? Date.now();
	const { ownerId, targetUserId, targetUsername, ctx, tab } = options;
	const { user, settings, companion } = ctx;
	const isSelf = ownerId === targetUserId;

	const partnerStarsStr = formatStarRating(companion.partnerStars);
	const subtitle = `Level ${user.level}  |  ${user.equippedTitle}  |  Partner: ${companion.partnerName} (${partnerStarsStr})`;

	const tabDefs: Array<{ key: ProfileHubTab; label: string; disabled?: boolean }> = [
		{ key: 'overview', label: 'OVERVIEW' },
		{ key: 'companion', label: 'COMPANION' },
		{ key: 'career', label: 'CAREER' },
		{ key: 'customize', label: 'CUSTOMIZE', disabled: !isSelf },
	];

	const tabs = tabDefs.map((t) => ({
		customId: encodeCustomId({
			domain: 'prf',
			action: 'tab',
			ownerId,
			state: t.key,
			extra: targetUserId,
			createdAtMs,
		}),
		label: t.label,
		active: tab === t.key,
		disabled: t.disabled,
	}));

	const fields: NekoFieldOption[] = [];
	const controls: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

	if (tab === 'overview') {
		fields.push({
			key: 'BIOGRAPHY',
			value: user.bio || 'A wandering Neko adventurer.',
		});

		const reqXp = calculateRequiredXpForLevel(user.level);
		const xpBar = formatProgressBar(user.xp, reqXp, 14);
		const xpBoostPct = Math.round(ctx.effectiveXpMultiplierBonus * 100);
		const coinBoostPct = Math.round(ctx.effectiveCoinMultiplierBonus * 100);
		const careerDef = CAREER_CATALOG.find((c) => c.id === user.careerId) ?? CAREER_CATALOG[0]!;

		let fortuneLine = 'None (Visit `/matsuri` -> `SHRINE`)';
		if (user.omikujiFortune && user.omikujiExpiresAt && user.omikujiExpiresAt.getTime() > nowMs) {
			const fDef = OMIKUJI_FORTUNES.find((f) => f.id === user.omikujiFortune);
			if (fDef) {
				fortuneLine = `${fDef.name} ${formatStatus(fDef.statusTag)}`;
			}
		}

		fields.push({
			key: 'PROGRESSION & MULTIPLIERS',
			value: [
				`**Level:** ${user.level} / ${PROGRESSION_LIMITS.MAX_USER_LEVEL}  \`${xpBar}\` (${user.xp.toLocaleString()} / ${reqXp.toLocaleString()} XP)`,
				`**Career:** ${careerDef.name} (Lv. ${user.careerLevel} / ${PROGRESSION_LIMITS.MAX_CAREER_LEVEL})`,
				`**Active Multipliers:** \`${xpBoostPct >= 0 ? '+' : ''}${xpBoostPct}% XP\`  |  \`${coinBoostPct >= 0 ? '+' : ''}${coinBoostPct}% Coins\``,
				`**Shrine Streak:** ${user.shrineStreak} Days  |  **Omikuji:** ${fortuneLine}`,
			].join('\n'),
		});

		// Respect Privacy Settings (AGENTS.md Section 4)
		if (!isSelf && !settings.publicWallet) {
			fields.push({
				key: 'WALLET & INVENTORY',
				value: `${formatStatus('ACCESS DENIED')} This user has set their wallet and shard balances to private in \`/settings\`.`,
			});
		} else {
			const walletTable = formatAlignedRows([
				{ label: 'Wallet Coins', value: `${user.coins.toLocaleString()} Coins` },
				{
					label: 'Vault Balance',
					value: `${user.vaultCoins.toLocaleString()} / ${user.vaultCapacity.toLocaleString()} Coins`,
				},
				{ label: 'Premium Gems', value: `${user.gems.toLocaleString()} Gems` },
				{
					label: 'Gacha Shards',
					value: `${user.shards.toLocaleString()} Shards (${user.starShards.toLocaleString()} Star Shards)`,
				},
			]);

			fields.push({
				key: 'WALLET SUMMARY',
				value: walletTable,
				codeBlock: true,
			});
		}

		const userSelect = new UserSelectMenuBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'prf',
					action: 'inspect',
					ownerId,
					state: 'overview',
					extra: targetUserId,
					createdAtMs,
				}),
			)
			.setPlaceholder('Inspect another server member’s Neko profile...');

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(userSelect),
		);
	} else if (tab === 'companion') {
		const reqAff = calculateRequiredAffectionForBond(companion.bondLevel);
		const bondBar = formatProgressBar(companion.affectionXp, reqAff, 16);
		const compXpPct = Math.round(
			(companion.bondLevel * 0.01 + (companion.partnerStars - 1) * 0.02) * 100,
		);
		const compCoinPct = Math.round(
			(companion.bondLevel * 0.0075 + (companion.partnerStars - 1) * 0.015) * 100,
		);
		const moodLabel =
			companion.mood >= 80
				? `Purring (${companion.mood}%)`
				: companion.mood >= 50
					? `Content (${companion.mood}%)`
					: `Sleepy (${companion.mood}%)`;

		const companionStats = formatAlignedRows([
			{
				label: 'Partner',
				value: `${companion.partnerName} [${companion.partnerRarity} • ${partnerStarsStr}]`,
			},
			{
				label: 'Bond Level',
				value: `Lv. ${companion.bondLevel} / ${PROGRESSION_LIMITS.MAX_COMPANION_BOND_LEVEL}  ${bondBar} ${companion.affectionXp} / ${reqAff} AFF`,
			},
			{
				label: 'Mood',
				value: `${moodLabel}  |  Passive Boost: +${compXpPct}% XP / +${compCoinPct}% Coins`,
			},
		]);

		fields.push({
			key: 'COMPANION STATS & BOND',
			value: companionStats,
			codeBlock: true,
		});

		const activeZone = EXPEDITION_ZONES.find((z) => z.id === companion.expeditionZoneId);
		const expEndsAtMs = companion.expeditionEndsAt?.getTime() ?? 0;
		const isExpRunning = Boolean(activeZone && expEndsAtMs > nowMs);
		const isExpClaimable = Boolean(activeZone && expEndsAtMs > 0 && expEndsAtMs <= nowMs);

		if (isExpRunning && activeZone) {
			fields.push({
				key: 'ACTIVE EXPEDITION',
				value: `${formatStatus('EXPEDITION')} Exploring **${activeZone.name}**\nReturns in ${formatCountdown(expEndsAtMs, nowMs)} — Est. Yield: \`${activeZone.minShards}–${activeZone.maxShards} Shards\``,
			});
		} else if (isExpClaimable && activeZone) {
			fields.push({
				key: 'ACTIVE EXPEDITION',
				value: `${formatStatus('CONFIRMED')} **${activeZone.name}** outing complete! Click **[ Claim Expedition ]** below to collect your Shards and bonus treats.`,
			});
		} else {
			const zoneLines = EXPEDITION_ZONES.map((z) => {
				const lockNote =
					companion.bondLevel < z.minBondLevel ? ` *(Requires Bond Lv. ${z.minBondLevel})*` : '';
				return `• **${z.name}** — \`${z.minShards}–${z.maxShards} Shards\`${lockNote}\n  ${z.description}`;
			}).join('\n');

			fields.push({
				key: 'IDLE NEKO EXPEDITIONS',
				value: zoneLines,
			});
		}

		if (isSelf) {
			const patBtn = new ButtonBuilder()
				.setCustomId(
					encodeCustomId({
						domain: 'prf',
						action: 'pat',
						ownerId,
						state: 'companion',
						extra: targetUserId,
						createdAtMs,
					}),
				)
				.setLabel('Headpat (+25 AFF)')
				.setStyle(ButtonStyle.Primary);

			const feedBtn = new ButtonBuilder()
				.setCustomId(
					encodeCustomId({
						domain: 'prf',
						action: 'feed',
						ownerId,
						state: 'companion',
						extra: targetUserId,
						createdAtMs,
					}),
				)
				.setLabel('Feed Taiyaki (+50 AFF)')
				.setStyle(ButtonStyle.Secondary);

			const expBtn = new ButtonBuilder()
				.setCustomId(
					encodeCustomId({
						domain: 'prf',
						action: isExpClaimable ? 'expclaim' : 'expstart',
						ownerId,
						state: EXPEDITION_ZONES[0]!.id,
						extra: targetUserId,
						createdAtMs,
					}),
				)
				.setLabel(
					isExpClaimable
						? 'Claim Expedition'
						: isExpRunning
							? 'On Expedition...'
							: 'Start Expedition',
				)
				.setStyle(isExpClaimable ? ButtonStyle.Primary : ButtonStyle.Secondary)
				.setDisabled(isExpRunning);

			controls.push(
				new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
					patBtn,
					feedBtn,
					expBtn,
				),
			);

			if (!isExpRunning && !isExpClaimable) {
				const zoneSelect = new StringSelectMenuBuilder()
					.setCustomId(
						encodeCustomId({
							domain: 'prf',
							action: 'expzone',
							ownerId,
							state: 'companion',
							extra: targetUserId,
							createdAtMs,
						}),
					)
					.setPlaceholder('Dispatch Companion to an Expedition Zone...')
					.addOptions(
						EXPEDITION_ZONES.map((z) =>
							new StringSelectMenuOptionBuilder()
								.setValue(z.id)
								.setLabel(`${z.name} (Bond Lv. ${z.minBondLevel}+)`)
								.setDescription(
									`Yields ${z.minShards}–${z.maxShards} Shards • ${Math.round(z.durationSeconds / 3_600)}h Outing`,
								),
						),
					);

				controls.push(
					new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(zoneSelect),
				);
			}
		}
	} else if (tab === 'career') {
		const activeCareer = CAREER_CATALOG.find((c) => c.id === user.careerId) ?? CAREER_CATALOG[0]!;
		const levelMultiplier = 1 + (user.careerLevel - 1) * 0.04;
		const estCoins = Math.round(
			activeCareer.baseCoins * levelMultiplier * (1 + ctx.effectiveCoinMultiplierBonus),
		);
		const estXp = Math.round(
			activeCareer.baseXp * levelMultiplier * (1 + ctx.effectiveXpMultiplierBonus),
		);

		fields.push({
			key: 'ACTIVE CAREER ASSIGNMENT',
			value: [
				`**Position:** **${activeCareer.name}** (Rank Lv. ${user.careerLevel} / ${PROGRESSION_LIMITS.MAX_CAREER_LEVEL})`,
				`**Description:** ${activeCareer.description}`,
				`**Shift Payout:** \`+${estCoins.toLocaleString()} Coins\` & \`+${estXp.toLocaleString()} XP\` (includes active multipliers)`,
			].join('\n'),
		});

		const ladderLines = CAREER_CATALOG.map((c) => {
			const unlocked = user.level >= c.minUserLevel;
			const currentTag = c.id === user.careerId ? ' `[ ACTIVE ]`' : '';
			const reqTag = unlocked ? '`[ UNLOCKED ]`' : `\`[ Requires Lv. ${c.minUserLevel} ]\``;
			return `• **${c.name}** ${reqTag}${currentTag} — Base: \`${c.baseCoins} Coins / ${c.baseXp} XP\``;
		}).join('\n');

		fields.push({
			key: 'CAREER PROGRESSION LADDER',
			value: ladderLines,
		});

		if (isSelf) {
			const workBtn = new ButtonBuilder()
				.setCustomId(
					encodeCustomId({
						domain: 'prf',
						action: 'work',
						ownerId,
						state: 'career',
						extra: targetUserId,
						createdAtMs,
					}),
				)
				.setLabel('Work Shift Now')
				.setStyle(ButtonStyle.Primary);

			controls.push(
				new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(workBtn),
			);

			const careerSelect = new StringSelectMenuBuilder()
				.setCustomId(
					encodeCustomId({
						domain: 'prf',
						action: 'setcareer',
						ownerId,
						state: 'career',
						extra: targetUserId,
						createdAtMs,
					}),
				)
				.setPlaceholder('Switch your active Career specialization...')
				.addOptions(
					CAREER_CATALOG.map((c) =>
						new StringSelectMenuOptionBuilder()
							.setValue(c.id)
							.setLabel(`${c.name} (Lv. ${c.minUserLevel}+)`)
							.setDescription(`Base: ${c.baseCoins} Coins & ${c.baseXp} XP per shift`)
							.setDefault(c.id === user.careerId),
					),
				);

			controls.push(
				new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(careerSelect),
			);
		}
	} else {
		const titles = options.unlockedTitles ?? DEFAULT_TITLES;

		fields.push({
			key: 'PROFILE CUSTOMIZATION',
			value: [`**Equipped Title:** ${user.equippedTitle}`, `**Current Bio:** ${user.bio}`].join(
				'\n',
			),
		});

		const editBioBtn = new ButtonBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'prf',
					action: 'openbio',
					ownerId,
					state: 'customize',
					extra: targetUserId,
					createdAtMs,
				}),
			)
			.setLabel('Edit Bio')
			.setStyle(ButtonStyle.Primary);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(editBioBtn),
		);

		const titleSelect = new StringSelectMenuBuilder()
			.setCustomId(
				encodeCustomId({
					domain: 'prf',
					action: 'settitle',
					ownerId,
					state: 'customize',
					extra: targetUserId,
					createdAtMs,
				}),
			)
			.setPlaceholder('Select an equipped [ NEKO ] profile title...')
			.addOptions(
				titles.slice(0, 15).map((t) =>
					new StringSelectMenuOptionBuilder()
						.setValue(t)
						.setLabel(t)
						.setDefault(t === user.equippedTitle),
				),
			);

		controls.push(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(titleSelect),
		);
	}

	const thumbnail =
		tab === 'companion' && companion.partnerImageUrl
			? companion.partnerImageUrl
			: options.targetAvatarUrl;

	const footer = options.footerNotice
		? statusFooter('UPDATED', options.footerNotice)
		: statusFooter('UPDATED', `Profile synced for ${targetUsername}`);

	return createNekoContainer({
		title: `${targetUsername}'s Profile`,
		subtitle,
		thumbnailUrl: thumbnail,
		tabs,
		fields,
		controls,
		footer,
	});
}

export class ProfileCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'profile',
			description:
				'Open your Neko profile, Companion bond & expeditions, Career shifts, and customization hub.',
			cooldownDelay: 2_000,
		});
	}

	public override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.addUserOption((opt) =>
					opt
						.setName('user')
						.setDescription('Inspect another member’s Neko profile')
						.setRequired(false),
				),
		);
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		const targetUser = interaction.options.getUser('user') ?? interaction.user;
		const ctx = await this.container.context.getUserContext(targetUser.id);

		const container = buildProfileCardContainer({
			ownerId: interaction.user.id,
			targetUserId: targetUser.id,
			targetUsername: targetUser.username,
			targetAvatarUrl: targetUser.displayAvatarURL({ size: 256 }),
			ctx,
			tab: 'overview',
		});

		await interaction.reply({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
		});
	}
}
