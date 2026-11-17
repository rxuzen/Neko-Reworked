import { Utility } from '@sapphire/plugin-utilities-store';
import { decodeCustomId, encodeCustomId, validateInteractionAccess } from '../lib/cv2/CustomId.ts';
import {
	decodeHtmlEntities,
	formatAlignedRows,
	formatProgressBar,
	formatStarRating,
	sanitizeAnimeText,
	truncateText,
} from '../lib/cv2/Formatters.ts';
import { createNekoContainer } from '../lib/cv2/NekoLayout.ts';
import {
	buildConfirmPrompt,
	buildNotificationContainer,
	confirm,
	notify,
} from '../lib/cv2/Notifications.ts';
import {
	discordTime,
	formatCountdown,
	formatDurationCompact,
	formatInTimezone,
	formatStatus,
	statusFooter,
	toUnixSeconds,
} from '../lib/cv2/TimeAndStatus.ts';

export class CV2Utility extends Utility {
	public constructor(context: Utility.LoaderContext, options: Utility.Options) {
		super(context, {
			...options,
			name: 'cv2',
		});
		this.container.cv2 = this;
	}

	// Core Layout & Notification Builders
	public readonly createNekoContainer = createNekoContainer;
	public readonly notify = notify;
	public readonly confirm = confirm;
	public readonly buildNotificationContainer = buildNotificationContainer;
	public readonly buildConfirmPrompt = buildConfirmPrompt;

	// Time & Status Helpers
	public readonly formatStatus = formatStatus;
	public readonly discordTime = discordTime;
	public readonly formatCountdown = formatCountdown;
	public readonly formatDurationCompact = formatDurationCompact;
	public readonly statusFooter = statusFooter;
	public readonly formatInTimezone = formatInTimezone;
	public readonly toUnixSeconds = toUnixSeconds;

	// Text, Alignment & Sanitization Formatters
	public readonly formatAlignedRows = formatAlignedRows;
	public readonly formatProgressBar = formatProgressBar;
	public readonly formatStarRating = formatStarRating;
	public readonly sanitizeAnimeText = sanitizeAnimeText;
	public readonly truncateText = truncateText;
	public readonly decodeHtmlEntities = decodeHtmlEntities;

	// Stateless CustomId Protocol
	public readonly encodeCustomId = encodeCustomId;
	public readonly decodeCustomId = decodeCustomId;
	public readonly validateInteractionAccess = validateInteractionAccess;
}

declare module '@sapphire/pieces' {
	interface Container {
		cv2: CV2Utility;
	}
}

declare module '@sapphire/plugin-utilities-store' {
	export interface Utilities {
		cv2: CV2Utility;
	}
}
