import { type ChatInputCommand, type Command, Precondition } from '@sapphire/framework';
import { PermissionFlagsBits, type PermissionsBitField } from 'discord.js';
import { env } from '../config/env.ts';

export type StaffTierLevel = 'MOD' | 'ADMIN' | 'OWNER';

const TIER_WEIGHT: Record<StaffTierLevel, number> = {
	MOD: 1,
	ADMIN: 2,
	OWNER: 3,
};

export function resolveMemberStaffTier(
	userId: string,
	permissions?: Readonly<PermissionsBitField> | null,
): StaffTierLevel | null {
	if (env.OWNER_IDS.includes(userId)) {
		return 'OWNER';
	}
	if (!permissions) {
		return null;
	}
	if (
		permissions.has(PermissionFlagsBits.Administrator) ||
		permissions.has(PermissionFlagsBits.ManageGuild)
	) {
		return 'ADMIN';
	}
	if (
		permissions.has(PermissionFlagsBits.ModerateMembers) ||
		permissions.has(PermissionFlagsBits.ManageMessages)
	) {
		return 'MOD';
	}
	return null;
}

export function hasRequiredStaffTier(
	actual: StaffTierLevel | null,
	required: StaffTierLevel,
): boolean {
	if (!actual) return false;
	return TIER_WEIGHT[actual] >= TIER_WEIGHT[required];
}

export interface StaffTierPreconditionContext extends Precondition.Context {
	minTier?: StaffTierLevel;
}

export class StaffTierPrecondition extends Precondition {
	public constructor(context: Precondition.LoaderContext, options: Precondition.Options) {
		super(context, {
			...options,
			name: 'StaffTier',
		});
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
		_command: ChatInputCommand,
		context: StaffTierPreconditionContext,
	) {
		const requiredTier = context.minTier ?? 'MOD';
		const actualTier = resolveMemberStaffTier(interaction.user.id, interaction.memberPermissions);

		if (hasRequiredStaffTier(actualTier, requiredTier)) {
			return this.ok();
		}

		await this.container.cv2.notify(interaction, {
			status: 'ACCESS DENIED',
			title: 'Insufficient Staff Clearance',
			subtitle: `Required Clearance: ${requiredTier}`,
			message: `You need **${requiredTier}** permissions or higher to access the \`/staff\` control panel.`,
			ephemeral: true,
		});

		return this.error({
			identifier: 'StaffTier',
			message: `Insufficient StaffTier (${requiredTier} required).`,
			context: { silent: true },
		});
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		StaffTier: StaffTierPreconditionContext;
	}
}
