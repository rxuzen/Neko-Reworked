import { CV2_LIMITS } from '../../config/constants.ts';

export interface CustomIdPayload {
	domain: string;
	action: string;
	ownerId: string;
	state?: string;
	extra?: string;
	createdAtMs?: number;
}

export interface DecodedCustomId {
	raw: string;
	domain: string;
	action: string;
	ownerId: string;
	state: string;
	extra: string;
	createdAtMs: number;
	isExpired: boolean;
}

export type CustomIdValidationResult =
	| { ok: true; data: DecodedCustomId }
	| {
			ok: false;
			reason: 'INVALID_FORMAT' | 'NOT_OWNER' | 'EXPIRED';
			data: DecodedCustomId | null;
	  };

function sanitizeSegment(segment: string): string {
	return segment.replace(/:/g, '_').trim();
}

export function encodeCustomId(payload: CustomIdPayload): string {
	const domain = sanitizeSegment(payload.domain);
	const action = sanitizeSegment(payload.action);
	const ownerId = sanitizeSegment(payload.ownerId);
	const state = sanitizeSegment(payload.state ?? '_');
	const extra = sanitizeSegment(payload.extra ?? '_');
	const createdAtMs = payload.createdAtMs ?? Date.now();
	const base36Timestamp = Math.floor(createdAtMs).toString(36);

	const encoded = `${domain}:${action}:${ownerId}:${state}:${extra}:${base36Timestamp}`;
	if (encoded.length > CV2_LIMITS.CUSTOM_ID_MAX_LENGTH) {
		throw new Error(
			`CustomId exceeds Discord 100-character limit (${encoded.length} chars): "${encoded}"`,
		);
	}

	return encoded;
}

export function decodeCustomId(
	customId: string,
	nowMs: number = Date.now(),
): DecodedCustomId | null {
	const parts = customId.split(':');
	if (parts.length !== 6) return null;

	const [domain, action, ownerId, state, extra, base36Timestamp] = parts;
	if (!domain || !action || !ownerId || !state || !extra || !base36Timestamp) {
		return null;
	}

	const createdAtMs = Number.parseInt(base36Timestamp, 36);
	if (Number.isNaN(createdAtMs) || createdAtMs <= 0) {
		return null;
	}

	const isExpired = nowMs - createdAtMs > CV2_LIMITS.INTERACTION_EXPIRY_MS;

	return {
		raw: customId,
		domain,
		action,
		ownerId,
		state: state === '_' ? '' : state,
		extra: extra === '_' ? '' : extra,
		createdAtMs,
		isExpired,
	};
}

export function validateInteractionAccess(
	customId: string,
	userId: string,
	nowMs: number = Date.now(),
): CustomIdValidationResult {
	const decoded = decodeCustomId(customId, nowMs);
	if (!decoded) {
		return { ok: false, reason: 'INVALID_FORMAT', data: null };
	}

	if (decoded.ownerId !== userId) {
		return { ok: false, reason: 'NOT_OWNER', data: decoded };
	}

	if (decoded.isExpired) {
		return { ok: false, reason: 'EXPIRED', data: decoded };
	}

	return { ok: true, data: decoded };
}
