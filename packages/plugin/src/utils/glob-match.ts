import { isFolder } from '@repo/shared/path';
import type { GlobMatchRule } from '@/types';

export type GlobMatchResult = 'include' | 'exclude' | 'advance' | 'probe';
type SegmentMatcher = RegExp;

type CompiledRule = {
	readonly segments: Array<SegmentMatcher | '**'>;
	readonly anchored: boolean;
	readonly directoryOnly: boolean;
	readonly hasSlash: boolean;
};

type Path = {
	readonly segments: Array<string>;
	readonly directory: boolean;
};

function parsePath(path: string): Path {
	if (path === '/') return { directory: true, segments: [] };
	const directory = isFolder(path);
	return {
		directory,
		segments: path.slice(0, directory ? -1 : undefined).split('/'),
	};
}

function escapeRegExpCharacter(character: string): string {
	return /[\\\(\)\[\]\{\}\|^$.*+?]/v.test(character) ? `\\${character}` : character;
}

function compileSegment(pattern: string, flags: string): SegmentMatcher {
	let source = '';
	for (let index = 0; index < pattern.length; index++) {
		const character = pattern[index];
		if (character === '*') {
			source += '.*';
			continue;
		}
		if (character === '?') {
			source += '.';
			continue;
		}
		if (character !== '[') {
			source += escapeRegExpCharacter(character);
			continue;
		}

		const end = pattern.indexOf(']', index + 1);
		if (end === -1 || end === index + 1)
			throw new Error(
				`Invalid glob pattern: unclosed or empty character class at index ${index}`,
			);
		const characterClass = pattern.slice(index + 1, end);
		const negated = characterClass.startsWith('!') || characterClass.startsWith('^');
		if (negated && characterClass.length === 1)
			throw new Error(
				`Invalid glob pattern: empty negated character class at index ${index}`,
			);
		source += `[${negated ? '^' : ''}${negated ? characterClass.slice(1) : characterClass}]`;
		index = end;
	}
	return new RegExp(`^${source}$`, flags);
}

export function normalizeGlob(glob: string): string | undefined {
	const expression = glob.trim().replaceAll('\\', '/');
	if (!expression || expression === '/') return;
	const anchored = expression.startsWith('/');
	const directoryOnly = expression.endsWith('/');
	const body = expression.replaceAll(/^\/+|\/+$/gv, '');
	if (!body) return;
	const parts = body.split('/').filter(Boolean);
	for (const part of parts)
		try {
			compileSegment(part, '');
		} catch {
			return;
		}
	return `${anchored ? '/' : ''}${parts.join('/')}${directoryOnly ? '/' : ''}`;
}

function compileRule(rule: GlobMatchRule): CompiledRule {
	const expression = rule.expr;
	const anchored = expression.startsWith('/');
	const directoryOnly = expression.endsWith('/');
	const body = expression.slice(anchored ? 1 : 0, directoryOnly ? -1 : undefined);
	const parts = body.split('/');
	const flags = rule.caseSensitive ? '' : 'i';
	const segments = parts.map((part) =>
		part === '**' && parts.length > 1 ? '**' : compileSegment(part, flags),
	);

	return {
		anchored,
		directoryOnly,
		hasSlash: parts.length > 1,
		segments,
	};
}

function matchesSegments(
	pattern: Array<SegmentMatcher | '**'>,
	path: Array<string>,
	patternIndex = 0,
	pathIndex = 0,
): boolean {
	if (patternIndex === pattern.length) return pathIndex === path.length;

	const segment = pattern[patternIndex];
	if (segment === '**') {
		const trailingGlobstar = patternIndex === pattern.length - 1;
		if (trailingGlobstar) return pathIndex < path.length || pattern.length === 1;
		if (matchesSegments(pattern, path, patternIndex + 1, pathIndex)) return true;
		return (
			pathIndex < path.length && matchesSegments(pattern, path, patternIndex, pathIndex + 1)
		);
	}

	return (
		pathIndex < path.length &&
		segment.test(path[pathIndex]) &&
		matchesSegments(pattern, path, patternIndex + 1, pathIndex + 1)
	);
}

function matchesRule(rule: CompiledRule, path: Path): boolean {
	const { segments } = path;
	if (!rule.hasSlash) {
		const matcher = rule.segments[0];
		if (matcher === '**') return segments.length > 0;
		if (rule.anchored)
			return (
				segments.length > 0 &&
				matcher.test(segments[0]) &&
				(!rule.directoryOnly || segments.length > 1 || path.directory)
			);

		return segments.some(
			(segment, index) =>
				matcher.test(segment) &&
				(!rule.directoryOnly || index < segments.length - 1 || path.directory),
		);
	}

	return matchesSegments(rule.segments, segments) && (!rule.directoryOnly || path.directory);
}

function matchesAncestor(rule: CompiledRule, path: Path): boolean {
	for (let index = 1; index < path.segments.length; index++)
		if (
			matchesRule(rule, {
				directory: true,
				segments: path.segments.slice(0, index),
			})
		)
			return true;

	return false;
}

function prefixStates(pattern: Array<SegmentMatcher | '**'>, path: Array<string>): Set<number> {
	let states = new Set([0]);

	const close = (input: Set<number>) => {
		const result = new Set(input);
		let changed = true;
		while (changed) {
			changed = false;
			for (const index of result) {
				if (pattern[index] !== '**' || result.has(index + 1)) continue;
				result.add(index + 1);
				changed = true;
			}
		}
		return result;
	};

	for (const segment of path) {
		const next = new Set<number>();
		for (const index of close(states)) {
			const matcher = pattern[index];
			if (matcher === '**') next.add(index);
			else if (matcher?.test(segment)) next.add(index + 1);
		}
		states = next;
		if (states.size === 0) return states;
	}

	return close(states);
}

function canMatchAnyDescendant(rule: CompiledRule, path: Path): boolean {
	if (!rule.hasSlash) {
		const matcher = rule.segments[0];
		if (matcher === '**') return true;
		if (!rule.anchored || path.segments.length === 0) return true;
		return matcher.test(path.segments[0]);
	}

	const pending: Array<[number, boolean]> = [];
	for (const state of prefixStates(rule.segments, path.segments)) pending.push([state, false]);
	const visited = new Set<string>();

	while (pending.length > 0) {
		const [index, consumed] = pending.pop() as [number, boolean];
		const key = `${index}:${consumed}`;
		if (visited.has(key)) continue;
		visited.add(key);

		if (index === rule.segments.length) {
			if (consumed) return true;
			continue;
		}

		const segment = rule.segments[index];
		if (segment === '**') pending.push([index + 1, consumed], [index, true]);
		else pending.push([index + 1, true]);
	}
	return false;
}

export function prepareGlobMatch(
	inclusion: Array<GlobMatchRule> = [],
	exclusion: Array<GlobMatchRule> = [],
): (path: string) => GlobMatchResult {
	const inclusions = inclusion.map(compileRule);
	const exclusions = exclusion.map(compileRule);

	return (path) => {
		const parsed = parsePath(path);
		if (parsed.segments.length === 0) return 'advance';

		const included = inclusions.some((rule) => matchesRule(rule, parsed));
		if (included) return parsed.directory ? 'advance' : 'include';

		const excluded = exclusions.some(
			(rule) => matchesRule(rule, parsed) || matchesAncestor(rule, parsed),
		);
		if (excluded) {
			if (parsed.directory && inclusions.some((rule) => canMatchAnyDescendant(rule, parsed)))
				return 'probe';
			return 'exclude';
		}

		return parsed.directory ? 'advance' : 'include';
	};
}
