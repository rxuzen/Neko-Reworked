import { PROGRESSION_LIMITS } from '../../config/constants.ts';

export interface AlignedRow {
	label: string;
	value: string | number;
	suffix?: string;
}

export function formatAlignedRows(rows: readonly AlignedRow[], separator = ' : '): string {
	if (rows.length === 0) return '';
	const maxLabelLength = Math.max(...rows.map((row) => row.label.length));

	return rows
		.map((row) => {
			const paddedLabel = row.label.padEnd(maxLabelLength, ' ');
			const suffix = row.suffix ? ` ${row.suffix}` : '';
			return `${paddedLabel}${separator}${row.value}${suffix}`;
		})
		.join('\n');
}

export function formatProgressBar(
	current: number,
	max: number,
	length = 16,
	filledChar = '█',
	emptyChar = '░',
): string {
	const safeMax = max <= 0 ? 1 : max;
	const ratio = Math.min(1, Math.max(0, current / safeMax));
	const filledCount = Math.round(ratio * length);
	const emptyCount = Math.max(0, length - filledCount);
	return `[${filledChar.repeat(filledCount)}${emptyChar.repeat(emptyCount)}]`;
}

export function formatStarRating(
	stars: number,
	maxStars: number = PROGRESSION_LIMITS.GACHA_MAX_STARS,
): string {
	const clamped = Math.min(maxStars, Math.max(0, Math.floor(stars)));
	return `${'★'.repeat(clamped)}${'☆'.repeat(Math.max(0, maxStars - clamped))}`;
}

const htmlEntities: Record<string, string> = {
	'&quot;': '"',
	'&#039;': "'",
	'&#39;': "'",
	'&apos;': "'",
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&mdash;': '—',
	'&ndash;': '–',
	'&hellip;': '...',
	'&nbsp;': ' ',
};

export function decodeHtmlEntities(input: string): string {
	return input
		.replace(
			/&(quot|#0?39|apos|amp|lt|gt|mdash|ndash|hellip|nbsp);/gi,
			(match) => htmlEntities[match.toLowerCase()] ?? match,
		)
		.replace(/&#(\d+);/g, (_, dec: string) => {
			const code = Number.parseInt(dec, 10);
			return Number.isNaN(code) ? _ : String.fromCodePoint(code);
		})
		.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
			const code = Number.parseInt(hex, 16);
			return Number.isNaN(code) ? _ : String.fromCodePoint(code);
		});
}

export function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	if (maxLength <= 3) return text.slice(0, Math.max(0, maxLength));

	let sliceEnd = maxLength - 3;

	// Avoid slicing inside a Markdown link [label](url)
	const lastOpenBracket = text.lastIndexOf('[', sliceEnd);
	if (lastOpenBracket !== -1) {
		const closingParen = text.indexOf(')', lastOpenBracket);
		if (closingParen === -1 || closingParen >= sliceEnd) {
			sliceEnd = Math.max(0, lastOpenBracket);
		}
	}

	let truncated = text.slice(0, sliceEnd).trimEnd();

	// Ensure trailing single '|' from a partial '||' is stripped
	if (truncated.endsWith('|') && !truncated.endsWith('||')) {
		truncated = truncated.slice(0, -1).trimEnd();
	}

	// Count '||' spoiler delimiters; if odd, close the spoiler before appending '...'
	const spoilerMatches = truncated.match(/\|\|/g);
	const hasUnclosedSpoiler = spoilerMatches ? spoilerMatches.length % 2 !== 0 : false;

	if (hasUnclosedSpoiler) {
		if (truncated.length + 5 > maxLength) {
			truncated = truncated.slice(0, Math.max(0, maxLength - 5)).trimEnd();
		}
		return `${truncated}||...`;
	}

	return `${truncated}...`;
}

export function sanitizeAnimeText(raw: string | null | undefined, maxLength = 900): string {
	if (!raw || raw.trim().length === 0) {
		return 'No description available.';
	}

	let text = raw
		// Convert AniList ~!spoiler!~ and MAL [spoiler]...[/spoiler] into Discord ||spoiler||
		.replace(/~!([\s\S]*?)!~/g, '|$1|')
		.replace(/\|([\s\S]*?)\|/g, (match, inner: string, offset: number, full: string) => {
			// Only convert single-pipe blocks produced above if not already ||
			if (full[offset - 1] === '|' || full[offset + match.length] === '|') {
				return match;
			}
			return `||${inner.trim()}||`;
		})
		.replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, (_, inner: string) => `||${inner.trim()}||`)
		// Convert common HTML line breaks and emphasis tags
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n\n')
		.replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
		.replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
		// Strip all remaining HTML tags
		.replace(/<[^>]+>/g, '');

	text = decodeHtmlEntities(text)
		// Strip AniList source attribution footers if trailing
		.replace(/\n*\(Source:\s*[^)]+\)\s*$/i, '')
		// Normalize excessive blank lines
		.replace(/\r\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	if (text.length === 0) {
		return 'No description available.';
	}

	return truncateText(text, maxLength);
}
