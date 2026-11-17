import { stripIndents } from 'common-tags';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	type MessageActionRowComponentBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from 'discord.js';
import { CV2_LIMITS } from '../../config/constants.ts';
import { env } from '../../config/env.ts';
import { pinoLogger } from '../logger.ts';
import { truncateText } from './Formatters.ts';

export interface NekoTabOption {
	customId: string;
	label: string;
	active?: boolean;
	disabled?: boolean;
}

export interface NekoFieldOption {
	key: string;
	value: string;
	codeBlock?: boolean;
	language?: string;
}

export interface NekoMediaItem {
	url: string;
	description?: string;
	spoiler?: boolean;
}

export interface NekoContainerOptions {
	title: string;
	subtitle?: string;
	thumbnailUrl?: string;
	tabs?: readonly NekoTabOption[];
	fields: readonly NekoFieldOption[];
	media?: readonly (string | NekoMediaItem)[];
	controls?: readonly ActionRowBuilder<MessageActionRowComponentBuilder>[];
	footer: string;
}

function formatFieldContent(field: NekoFieldOption, maxValueChars: number): string {
	const keyHeader = `-# **${field.key.trim().toUpperCase()}**`;
	if (field.codeBlock) {
		const lang = field.language ?? 'text';
		const wrapperOverhead = lang.length + 10; // ```lang\n...\n```
		const allowedInner = Math.max(16, maxValueChars - keyHeader.length - wrapperOverhead);
		const safeInner =
			field.value.length > allowedInner
				? `${field.value.slice(0, Math.max(0, allowedInner - 18))}\n... [truncated]`
				: field.value;
		return `${keyHeader}\n\`\`\`${lang}\n${safeInner}\n\`\`\``;
	}

	const allowedValue = Math.max(16, maxValueChars - keyHeader.length - 2);
	const safeValue = truncateText(field.value.trim(), allowedValue);
	return stripIndents`
		${keyHeader}
		${safeValue}
	`;
}

export function createNekoContainer(options: NekoContainerOptions): ContainerBuilder {
	const container = new ContainerBuilder();

	const cleanTitle = options.title.startsWith('### ')
		? options.title.trim()
		: `### ${options.title.trim()}`;
	const cleanSubtitle = options.subtitle
		? options.subtitle.startsWith('-# ')
			? options.subtitle.trim()
			: `-# ${options.subtitle.trim()}`
		: undefined;

	const headerContent = cleanSubtitle ? `${cleanTitle}\n${cleanSubtitle}` : cleanTitle;
	const cleanFooter = options.footer.startsWith('-# ')
		? options.footer.trim()
		: `-# ${options.footer.trim()}`;

	let usedChars = headerContent.length + cleanFooter.length;

	// 1. Header (SectionBuilder + ThumbnailBuilder if thumbnailUrl is present, else TextDisplayBuilder)
	if (options.thumbnailUrl) {
		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(options.thumbnailUrl));
		container.addSectionComponents(section);
	} else {
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent));
	}

	// 2. Top Navigation Tabs (always framed between two divider: true separators)
	if (options.tabs && options.tabs.length > 0) {
		container.addSeparatorComponents(
			new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
		);

		const tabButtons = options.tabs.slice(0, 5).map((tab) => {
			const isActive = Boolean(tab.active);
			return new ButtonBuilder()
				.setCustomId(tab.customId)
				.setLabel(tab.label)
				.setStyle(isActive ? ButtonStyle.Primary : ButtonStyle.Secondary)
				.setDisabled(isActive || Boolean(tab.disabled));
		});

		container.addActionRowComponents(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(tabButtons),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
		);
	} else {
		container.addSeparatorComponents(
			new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
		);
	}

	// 3. Body Fields (KEY on top, Value underneath, strictly capped within 3,850 character budget)
	const maxTextBudget = CV2_LIMITS.SAFE_CHARACTER_CAP - 200;
	for (const field of options.fields) {
		const remainingBudget = maxTextBudget - usedChars;
		if (remainingBudget <= 32) {
			break;
		}

		const rendered = formatFieldContent(field, remainingBudget);
		usedChars += rendered.length;
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(rendered));
	}

	// 4. Optional Media Gallery
	if (options.media && options.media.length > 0) {
		const gallery = new MediaGalleryBuilder();
		for (const item of options.media.slice(0, 10)) {
			const mediaItem = new MediaGalleryItemBuilder();
			if (typeof item === 'string') {
				mediaItem.setURL(item);
			} else {
				mediaItem.setURL(item.url);
				if (item.description) mediaItem.setDescription(item.description);
				if (item.spoiler) mediaItem.setSpoiler(true);
			}
			gallery.addItems(mediaItem);
		}
		container.addMediaGalleryComponents(gallery);
	}

	// 5. Bottom Action Controls (preceded by divider: false separator)
	if (options.controls && options.controls.length > 0) {
		container.addSeparatorComponents(
			new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
		);
		for (const row of options.controls.slice(0, 4)) {
			container.addActionRowComponents(row);
		}
	}

	// 6. Dynamic Context Footer (preceded by divider: true separator)
	container.addSeparatorComponents(
		new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
	);
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(cleanFooter));

	if (env.NODE_ENV === 'development' && usedChars > CV2_LIMITS.WARN_CHARACTER_THRESHOLD) {
		pinoLogger.warn(
			{ usedChars, safeCap: CV2_LIMITS.SAFE_CHARACTER_CAP, title: options.title },
			'CV2 container exceeded 3,400 character warning threshold',
		);
	}

	return container;
}
