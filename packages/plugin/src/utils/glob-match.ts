import { isFolder } from '@repo/shared/path';
import type { GlobStrategy } from '@/types';

export type GlobMatchResult = { strategy: string; advance?: boolean };
export const NONE_STRATEGY = 'none';

type CompiledRule = {
	readonly strategy: string;
	readonly segments: Array<RegExp | '**'>;
	readonly anchored: boolean;
	readonly directoryOnly: boolean;
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
	return /[\\()[\]{}|^$.*+?]/u.test(character) ? `\\${character}` : character;
}

function expandBraces(pattern: string): Array<string> {
	const open = pattern.indexOf('{');
	if (open === -1) return [pattern];
	const alternatives: Array<string> = [];
	let depth = 0;
	let end = -1;
	let start = open + 1;
	for (let index = open; index < pattern.length; index++) {
		const character = pattern[index];
		if (character === '{') depth++;
		else if (character === '}') {
			depth--;
			if (depth === 0) {
				end = index;
				break;
			}
		} else if (character === ',' && depth === 1) {
			alternatives.push(pattern.slice(start, index));
			start = index + 1;
		}
	}
	if (end === -1 || alternatives.length === 0) {
		const prefix = pattern.slice(0, open + 1);
		return expandBraces(pattern.slice(open + 1)).map((rest) => prefix + rest);
	}
	const head = pattern.slice(0, open);
	const tail = pattern.slice(end + 1);
	alternatives.push(pattern.slice(start, end));
	return alternatives.flatMap((alternative) => expandBraces(head + alternative + tail));
}

function compileSource(pattern: string): string {
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
	return source;
}

// Each path segment compiles to exactly one regex, so brace alternatives merge into a single alternation; braces expand before compilation, nested groups and later braces expand recursively, while unmatched braces stay literal
function compilePattern(pattern: string): RegExp {
	const source = expandBraces(pattern)
		.map((alternative) => `(?:${compileSource(alternative)})`)
		.join('|');
	return new RegExp(`^${source}$`, 'u');
}

export function normalizeGlob(glob: string): string | undefined {
	const expression = glob.trim().replaceAll('\\', '/');
	if (!expression || expression === '/') return;
	const anchored = expression.startsWith('/');
	const directoryOnly = expression.endsWith('/');
	const body = expression.replaceAll(/^\/+|\/+$/gu, '');
	if (!body) return;
	const parts = body.split('/').filter(Boolean);
	for (const part of parts)
		try {
			compilePattern(part);
		} catch {
			return;
		}
	return `${anchored ? '/' : ''}${parts.join('/')}${directoryOnly ? '/' : ''}`;
}

function compileRule({ expr, strategy }: GlobStrategy): CompiledRule {
	const leadingSlash = expr.startsWith('/');
	const directoryOnly = expr.endsWith('/');
	const parts = expr.slice(leadingSlash ? 1 : 0, directoryOnly ? -1 : undefined).split('/');
	return {
		// Patterns containing a slash (besides a trailing one) only match from the vault root, while a lone segment matches at any depth
		anchored: leadingSlash || parts.length > 1,
		directoryOnly,
		segments: parts.map((part) => (part === '**' ? '**' : compilePattern(part))),
		strategy,
	};
}

function matchSegments(
	pattern: Array<RegExp | '**'>,
	segments: Array<string>,
	patternIndex = 0,
	pathIndex = 0,
): boolean {
	if (patternIndex === pattern.length) return pathIndex === segments.length;

	const segment = pattern[patternIndex];
	if (segment === '**') {
		// A trailing globstar consumes one or more segments, an inner one zero or more
		if (patternIndex === pattern.length - 1) return pathIndex < segments.length;
		if (matchSegments(pattern, segments, patternIndex + 1, pathIndex)) return true;
		return (
			pathIndex < segments.length &&
			matchSegments(pattern, segments, patternIndex, pathIndex + 1)
		);
	}

	return (
		pathIndex < segments.length &&
		segment.test(segments[pathIndex]) &&
		matchSegments(pattern, segments, patternIndex + 1, pathIndex + 1)
	);
}

function matchesExactly(rule: CompiledRule, path: Path): boolean {
	const { segments } = path;
	if (!rule.anchored) {
		const [matcher] = rule.segments;
		const hit = matcher === '**' ? segments.length > 0 : segments.some((s) => matcher.test(s));
		return hit && (!rule.directoryOnly || path.directory);
	}
	return matchSegments(rule.segments, segments) && (!rule.directoryOnly || path.directory);
}

function matchesRule(rule: CompiledRule, path: Path): boolean {
	if (matchesExactly(rule, path)) return true;
	// A rule matching an ancestor folder also applies to everything inside it
	for (let end = 1; end < path.segments.length; end++)
		if (matchesExactly(rule, { directory: true, segments: path.segments.slice(0, end) }))
			return true;
	return false;
}

function prefixStates(pattern: Array<RegExp | '**'>, path: Array<string>): Set<number> {
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
	if (!rule.anchored) return true;
	// Regex segments are always traversable by arbitrary descendant names and a globstar can always consume one segment, so any reachable state before the pattern end absorbs at least one strict descendant segment
	return [...prefixStates(rule.segments, path.segments)].some(
		(state) => state < rule.segments.length,
	);
}

// Whether the rule matches every possible strict descendant of the folder: only a trailing run of globstars can absorb arbitrary segments below it, while a fully consumed pattern is a dead end rather than an absorber
function matchesAllDescendants(rule: CompiledRule, path: Path): boolean {
	if (rule.directoryOnly) return false; // Files always escape directory-only rules
	const { segments: pattern } = rule;
	const states = [...prefixStates(pattern, path.segments)];
	return (
		states.some((state) => state < pattern.length && pattern[state] === '**') &&
		states.every((state) => state === pattern.length || pattern[state] === '**')
	);
}

export function prepareGlobMatch(rules: Array<GlobStrategy>): (path: string) => GlobMatchResult {
	const compiled = rules.map(compileRule);

	return (path) => {
		const parsed = parsePath(path);
		let strategy = NONE_STRATEGY;
		let lastMatch = -1;
		for (const [index, rule] of compiled.entries())
			if (matchesRule(rule, parsed)) {
				strategy = rule.strategy;
				lastMatch = index;
			}

		if (!parsed.directory) return { strategy };

		// A later `none` rule matching every possible descendant shadows everything before it, so descendants can only be reclaimed by rules after the highest such catch-all
		let floor = lastMatch;
		for (const [index, rule] of compiled.entries())
			if (
				index > floor &&
				rule.strategy === NONE_STRATEGY &&
				matchesAllDescendants(rule, parsed)
			)
				floor = index;

		// Descendants inherit the folder's own strategy unless a catch-all shadows it
		const inherits = floor === lastMatch && strategy !== NONE_STRATEGY;
		return {
			advance:
				inherits ||
				compiled.some(
					(rule, index) =>
						index > floor &&
						rule.strategy !== NONE_STRATEGY &&
						canMatchAnyDescendant(rule, parsed),
				),
			strategy,
		};
	};
}
