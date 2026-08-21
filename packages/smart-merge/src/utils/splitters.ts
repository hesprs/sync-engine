import type { MergeSegment } from './merge';

const HIRAGANA_KATAKANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAN_RE = /\p{Script=Han}/u;
const PROBES: Array<[RegExp, string]> = [
	[/\p{Script=Thai}/u, 'th'],
	[/\p{Script=Lao}/u, 'lo'],
	[/\p{Script=Khmer}/u, 'km'],
	[/\p{Script=Myanmar}/u, 'my'],
	[/\p{Script=Tibetan}/u, 'bo'],
];
const SPACED_PATTERN =
	/[\p{L}\p{N}\p{M}]+(?:['’\u02BC\-–][\p{L}\p{N}\p{M}]+)*|[^\p{L}\p{N}\p{M}\s]+|\s+/gu;

const segmenterCache = new Map<string, Intl.Segmenter>();
function getSegmenter(locale: string): Intl.Segmenter {
	let segmenter = segmenterCache.get(locale);
	if (!segmenter) {
		segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
		segmenterCache.set(locale, segmenter);
	}
	return segmenter;
}

function detectScript(text: string): { locale: string; noSpace: boolean } {
	if (HIRAGANA_KATAKANA_RE.test(text)) return { locale: 'ja', noSpace: true };
	for (const [re, locale] of PROBES) if (re.test(text)) return { locale, noSpace: true };
	if (HAN_RE.test(text)) return { locale: 'zh', noSpace: true };
	return { locale: 'en', noSpace: false };
}

function processSegments(segments: Array<string>): {
	tokens: Array<string>;
	joints: Array<string>;
} {
	const tokens: Array<string> = [];
	const joints: Array<string> = [];
	let currentJoint = '';
	let hasTokens = false;

	for (const segment of segments) {
		if (/^\s+$/u.test(segment)) {
			if (hasTokens) currentJoint += segment;
			continue;
		}
		if (hasTokens) {
			joints.push(currentJoint);
			currentJoint = '';
		}
		tokens.push(segment);
		hasTokens = true;
	}

	return { joints, tokens };
}

function tokenizeSpaced(text: string): { tokens: Array<string>; joints: Array<string> } {
	return processSegments(text.match(SPACED_PATTERN) ?? []);
}

function tokenizeSegmented(
	text: string,
	locale: string,
): { tokens: Array<string>; joints: Array<string> } {
	const segmenter = getSegmenter(locale);
	const segments: Array<string> = [];
	for (const { segment } of segmenter.segment(text)) segments.push(segment);
	return processSegments(segments);
}

export function proseSplitter(text: string): MergeSegment {
	if (text.length === 0) return { joints: [], splitters: [undefined], tokens: [''] };
	const { locale, noSpace } = detectScript(text);
	const { tokens, joints } = noSpace ? tokenizeSegmented(text, locale) : tokenizeSpaced(text);
	return { joints, splitters: Array.from<undefined>({ length: tokens.length }), tokens };
}

export function codeSplitter(text: string): MergeSegment {
	const tokens: Array<string> = text.split(/\n+/u);
	return {
		joints: text.match(/\n+/gu) ?? [],
		splitters: Array.from<undefined>({ length: tokens.length }),
		tokens,
	};
}

export function documentSplitter(text: string): MergeSegment {
	const tokens: Array<string> = [];
	const joints: Array<string> = [];
	const splitters: Array<(str: string) => MergeSegment> = [];
	const lines = text.split('\n');
	let i = 0;
	let pendingNewlines = 0;
	const flushJoint = () => {
		if (tokens.length > 0) joints.push('\n'.repeat(pendingNewlines + 1));
		pendingNewlines = 0;
	};
	while (i < lines.length) {
		const line = lines[i];
		if (line.trim() === '') {
			pendingNewlines++;
			i++;
			continue;
		}

		const fenceMatch = /^(?<fence>```|~~~|\$\$)/u.exec(line);
		flushJoint();

		if (fenceMatch) {
			tokens.push(line);
			splitters.push(codeSplitter);
			i++;

			const fenceType = fenceMatch.groups?.fence;
			if (!fenceType) continue;
			const contentLines: Array<string> = [];
			while (i < lines.length && !lines[i].startsWith(fenceType)) {
				contentLines.push(lines[i]);
				i++;
			}
			if (contentLines.length > 0) {
				joints.push('\n');
				tokens.push(contentLines.join('\n'));
				splitters.push(codeSplitter);
			}
			if (i < lines.length) {
				joints.push('\n');
				tokens.push(lines[i]);
				splitters.push(codeSplitter);
				i++;
			}
			continue;
		}

		tokens.push(line);
		splitters.push(proseSplitter);
		i++;
	}

	return { joints, splitters, tokens };
}
