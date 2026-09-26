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

function compileSegment(pattern: string): RegExp {
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
			compileSegment(part);
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
		segments: parts.map((part) => (part === '**' ? '**' : compileSegment(part))),
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

// An inner globstar can always skip ahead because it also matches zero segments
function closeInner(pattern: Array<RegExp | '**'>, states: Set<number>): Set<number> {
	const closed = new Set(states);
	for (let index = 0; index < pattern.length - 1; index++)
		if (pattern[index] === '**') closed.add(index + 1);
	return closed;
}

// Pattern positions still reachable after consuming the folder's own segments: a pending rule never completes here, since completing would mean it already matched the folder
function pendingStates(pattern: Array<RegExp | '**'>, path: Array<string>): Set<number> {
	let states = new Set<number>([0]);
	for (const segment of path) {
		const next = new Set<number>();
		for (const index of closeInner(pattern, states)) {
			const matcher = pattern[index];
			if (matcher === '**') next.add(index);
			else if (matcher?.test(segment)) next.add(index + 1);
		}
		if (next.size === 0) return next;
		states = next;
	}
	return closeInner(pattern, states);
}

// Whether a compiled segment matches every possible segment, namely `*`
function isUniversal(segment: RegExp | '**'): segment is RegExp {
	return segment !== '**' && segment.source === '^.*$';
}

// A pending rule and the pattern positions it can still be live at; identical patterns share one entry so they complete in lockstep
type PendingRule = {
	readonly indices: Array<number>;
	readonly rule: CompiledRule;
	readonly states: Set<number>;
};

// The outcomes of one unknown segment below the folder: globstars and `*` advance unconditionally, while each other regex independently matches or misses
type Stepped = { completed: boolean } & PendingRule;

function stepOptions({ rule, states }: PendingRule): Array<Stepped> {
	const { segments: pattern } = rule;
	const len = pattern.length;
	if (!rule.anchored) {
		// A lone segment matches at any depth, so it stays pending until its first hit
		if (isUniversal(pattern[0]) || pattern[0] === '**')
			return [{ completed: true, indices: [], rule, states: new Set<number>() }];
		return [
			{ completed: false, indices: [], rule, states: new Set<number>([0]) },
			{ completed: true, indices: [], rule, states: new Set<number>() },
		];
	}
	const closed = closeInner(pattern, states);
	const branching = [...closed].filter(
		(index) => pattern[index] !== '**' && !isUniversal(pattern[index] as RegExp | '**'),
	);
	return Array.from({ length: 1 << branching.length }, (_, mask) => {
		const next = new Set<number>();
		for (const index of closed) {
			const matcher = pattern[index];
			if (matcher === '**') {
				next.add(index);
				// A trailing globstar absorbs the segment and may also finish here
				if (index === len - 1) next.add(len);
			} else if (isUniversal(matcher)) next.add(index + 1);
		}
		for (const i of branching.keys()) if (mask & (1 << i)) next.add(branching[i] + 1);
		return { completed: next.has(len), indices: [], rule, states: closeInner(pattern, next) };
	});
}

export function prepareGlobMatch(rules: Array<GlobStrategy>): (path: string) => GlobMatchResult {
	const compiled = rules.map(compileRule);
	const strategyAt = (index: number) => (index === -1 ? NONE_STRATEGY : compiled[index].strategy);

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

		// Rules after the last match can still reclaim descendants, tracked as tiny automata while descending unknown segments below the folder
		const groups = new Map<string, PendingRule>();
		for (let index = lastMatch + 1; index < compiled.length; index++) {
			const rule = compiled[index];
			const states = rule.anchored
				? pendingStates(rule.segments, parsed.segments)
				: new Set<number>([0]);
			if (states.size === 0) continue;
			// Identical patterns always complete together, so they share one automaton to stay in lockstep
			const key = `${rule.anchored}:${rule.segments.map((s) => (s === '**' ? '**' : s.source)).join('/')}`;
			const group = groups.get(key);
			if (group) group.indices.push(index);
			else groups.set(key, { indices: [index], rule, states });
		}

		// A descendant resolves to the highest rule completed along its path, starting from the folder's own last match
		const seen = new Set<string>();
		const walk = (pending: Array<PendingRule>, resolved: number): boolean => {
			const key = `${resolved};${pending
				.map(
					(p) =>
						`${p.indices.join(',')}=${[...p.states].sort((a, b) => a - b).join(',')}`,
				)
				.join('|')}`;
			if (seen.has(key)) return false;
			seen.add(key);
			// Enumerate the joint outcomes of one unknown segment
			const step = (index: number, acc: Array<Stepped>): boolean => {
				if (index === pending.length) {
					const done = acc.filter((o) => o.completed).flatMap((o) => o.indices);
					const folder = Math.max(resolved, ...done);
					if (strategyAt(folder) !== NONE_STRATEGY) return true;
					// Files escape directory-only rules, so one completing on the final segment cannot claim them
					const file = Math.max(
						resolved,
						...done.filter((i) => !compiled[i].directoryOnly),
					);
					if (strategyAt(file) !== NONE_STRATEGY) return true;
					return walk(
						acc.filter((o) => !o.completed && o.states.size > 0),
						folder,
					);
				}
				for (const option of stepOptions(pending[index])) {
					const outcome = { ...option, indices: pending[index].indices };
					if (step(index + 1, [...acc, outcome])) return true;
				}
				return false;
			};
			return step(0, []);
		};
		return { advance: walk([...groups.values()], lastMatch), strategy };
	};
}
