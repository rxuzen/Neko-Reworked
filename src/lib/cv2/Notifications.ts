import {
	ActionRowBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	ComponentType,
	type ContainerBuilder,
	type MessageActionRowComponentBuilder,
	MessageFlags,
	type RepliableInteraction,
} from 'discord.js';
import { encodeCustomId } from './CustomId.ts';
import { type NekoFieldOption, createNekoContainer } from './NekoLayout.ts';
import { type NekoStatusTag, formatStatus, statusFooter } from './TimeAndStatus.ts';

export interface NotifyOptions {
	status: NekoStatusTag | string;
	title: string;
	subtitle?: string;
	key?: string;
	message: string;
	codeBlock?: boolean;
	fields?: readonly NekoFieldOption[];
	footerMessage?: string;
	ephemeral?: boolean;
	inPlace?: boolean;
}

export function buildNotificationContainer(options: NotifyOptions): ContainerBuilder {
	const statusTag = formatStatus(options.status);
	const fullTitle = options.title.startsWith('[') ? options.title : `${statusTag} ${options.title}`;

	const fields: NekoFieldOption[] = options.fields
		? [...options.fields]
		: [
				{
					key: options.key ?? 'DETAILS',
					value: options.message,
					codeBlock: options.codeBlock,
				},
			];

	const footer = statusFooter(options.status, options.footerMessage ?? 'Notification generated');

	return createNekoContainer({
		title: fullTitle,
		subtitle: options.subtitle,
		fields,
		footer,
	});
}

export async function notify(
	interaction: RepliableInteraction,
	options: NotifyOptions,
): Promise<void> {
	const container = buildNotificationContainer(options);
	const ephemeral = options.ephemeral ?? true;
	const flags = ephemeral
		? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
		: MessageFlags.IsComponentsV2;

	if (
		options.inPlace &&
		interaction.isMessageComponent() &&
		!interaction.replied &&
		!interaction.deferred
	) {
		await interaction.update({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
		});
		return;
	}

	if (interaction.deferred || interaction.replied) {
		await interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
		});
		return;
	}

	await interaction.reply({
		flags,
		components: [container],
	});
}

export interface ConfirmPromptOptions {
	ownerId: string;
	domain?: string;
	title: string;
	subtitle?: string;
	key?: string;
	message: string;
	fields?: readonly NekoFieldOption[];
	confirmLabel?: string;
	cancelLabel?: string;
	confirmedMessage?: string;
	cancelledMessage?: string;
	ephemeral?: boolean;
	inPlace?: boolean;
	timeoutMs?: number;
	createdAtMs?: number;
}

export interface BuiltConfirmPrompt {
	container: ContainerBuilder;
	confirmId: string;
	cancelId: string;
}

export function buildConfirmPrompt(
	options: ConfirmPromptOptions,
	resolution?: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED',
): BuiltConfirmPrompt {
	const state = resolution ?? 'PENDING';
	const createdAtMs = options.createdAtMs ?? Date.now();
	const domain = options.domain ?? 'sys';

	const confirmId = encodeCustomId({
		domain,
		action: 'confirm',
		ownerId: options.ownerId,
		state: 'yes',
		createdAtMs,
	});

	const cancelId = encodeCustomId({
		domain,
		action: 'cancel',
		ownerId: options.ownerId,
		state: 'no',
		createdAtMs,
	});

	const isPending = state === 'PENDING';
	const confirmBtn = new ButtonBuilder()
		.setCustomId(confirmId)
		.setLabel(options.confirmLabel ?? 'Confirm')
		.setStyle(
			state === 'CONFIRMED'
				? ButtonStyle.Primary
				: isPending
					? ButtonStyle.Primary
					: ButtonStyle.Secondary,
		)
		.setDisabled(!isPending);

	const cancelBtn = new ButtonBuilder()
		.setCustomId(cancelId)
		.setLabel(options.cancelLabel ?? 'Cancel')
		.setStyle(state === 'CANCELLED' ? ButtonStyle.Primary : ButtonStyle.Secondary)
		.setDisabled(!isPending);

	const actionRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
		confirmBtn,
		cancelBtn,
	);

	const fields: NekoFieldOption[] = options.fields
		? [...options.fields]
		: [
				{
					key: options.key ?? 'CONFIRMATION REQUIRED',
					value:
						state === 'CONFIRMED' && options.confirmedMessage
							? options.confirmedMessage
							: state === 'CANCELLED' && options.cancelledMessage
								? options.cancelledMessage
								: options.message,
				},
			];

	const footer =
		state === 'CONFIRMED'
			? statusFooter('CONFIRMED', 'Applied')
			: state === 'CANCELLED'
				? statusFooter('CANCELLED', 'Cancelled by user')
				: state === 'EXPIRED'
					? statusFooter('EXPIRED', 'Confirmation prompt timed out')
					: `Awaiting confirmation from <@${options.ownerId}>`;

	const titlePrefix = state === 'PENDING' ? '' : `${formatStatus(state)} `;

	const container = createNekoContainer({
		title: `${titlePrefix}${options.title}`,
		subtitle: options.subtitle,
		fields,
		controls: [actionRow],
		footer,
	});

	return { container, confirmId, cancelId };
}

export async function confirm(
	interaction: RepliableInteraction,
	options: ConfirmPromptOptions,
): Promise<{ confirmed: boolean; interaction: ButtonInteraction | null }> {
	const createdAtMs = options.createdAtMs ?? Date.now();
	const promptOptions: ConfirmPromptOptions = { ...options, createdAtMs };
	const { container, confirmId, cancelId } = buildConfirmPrompt(promptOptions, 'PENDING');
	const ephemeral = options.ephemeral ?? false;
	const timeoutMs = options.timeoutMs ?? 60_000;

	let responseMessage: {
		awaitMessageComponent: typeof interaction.channel extends null ? never : unknown;
	} | null = null;

	if (
		options.inPlace &&
		interaction.isMessageComponent() &&
		!interaction.replied &&
		!interaction.deferred
	) {
		const res = await interaction.update({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
			withResponse: true,
		});
		responseMessage = res.resource?.message ?? null;
	} else if (interaction.deferred || interaction.replied) {
		responseMessage = await interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
		});
	} else {
		const res = await interaction.reply({
			flags: ephemeral
				? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
				: MessageFlags.IsComponentsV2,
			components: [container],
			withResponse: true,
		});
		responseMessage = res.resource?.message ?? null;
	}

	if (!responseMessage || !('awaitMessageComponent' in responseMessage)) {
		return { confirmed: false, interaction: null };
	}

	try {
		const msg = responseMessage as {
			awaitMessageComponent: (opts: {
				componentType: ComponentType.Button;
				time: number;
				filter: (i: ButtonInteraction) => Promise<boolean>;
			}) => Promise<ButtonInteraction>;
		};

		const buttonInteraction = await msg.awaitMessageComponent({
			componentType: ComponentType.Button,
			time: timeoutMs,
			filter: async (i: ButtonInteraction) => {
				if (i.customId !== confirmId && i.customId !== cancelId) return false;
				if (i.user.id !== options.ownerId) {
					await notify(i, {
						status: 'ACCESS DENIED',
						title: 'Not Your Prompt',
						message: 'Only the user who initiated this action can confirm or cancel it.',
						ephemeral: true,
					});
					return false;
				}
				return true;
			},
		});

		const isConfirmed = buttonInteraction.customId === confirmId;
		const updated = buildConfirmPrompt(promptOptions, isConfirmed ? 'CONFIRMED' : 'CANCELLED');

		await buttonInteraction.update({
			flags: MessageFlags.IsComponentsV2,
			components: [updated.container],
		});

		return { confirmed: isConfirmed, interaction: buttonInteraction };
	} catch {
		const expired = buildConfirmPrompt(promptOptions, 'EXPIRED');
		try {
			await interaction.editReply({
				flags: MessageFlags.IsComponentsV2,
				components: [expired.container],
			});
		} catch {
			// Ignore if message was deleted
		}
		return { confirmed: false, interaction: null };
	}
}
