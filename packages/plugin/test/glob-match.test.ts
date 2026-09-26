import { expect, test } from 'bun:test';
import type { GlobStrategy } from '@/types';
import type { GlobMatchResult } from '@/utils/glob-match';
import { NONE_STRATEGY, normalizeGlob, prepareGlobMatch } from '@/utils/glob-match';

const rule = (expr: string, strategy: string): GlobStrategy => ({ expr, strategy });

const results = (paths: Array<string>, matcher: (path: string) => GlobMatchResult) =>
	Object.fromEntries(paths.map((path) => [path, matcher(path)]));

test('normalizes glob separators and preserves boundary semantics', () => {
	expect(normalizeGlob(String.raw`  \foo//bar///  `)).toBe('/foo/bar/');
	expect(normalizeGlob('///foo/bar')).toBe('/foo/bar');
	expect(normalizeGlob('foo/bar///')).toBe('foo/bar/');
});

test('rejects empty and unparseable globs', () => {
	for (const glob of ['', '   ', '/', '///', 'foo/[', 'foo/[]', 'foo/[!]'])
		expect(normalizeGlob(glob)).toBeUndefined();
});

test('defaults paths to the none strategy when no rule matches', () => {
	const match = prepareGlobMatch([]);
	expect(results(['/', 'some/', 'some/file.txt'], match)).toEqual({
		'/': { advance: false, strategy: NONE_STRATEGY },
		'some/': { advance: false, strategy: NONE_STRATEGY },
		'some/file.txt': { strategy: NONE_STRATEGY },
	});
});

test('applies the last matching rule', () => {
	const match = prepareGlobMatch([
		rule('*', 'bidirectional'),
		rule('secret.md', 'mirrorLocal'),
		rule('secret.md', NONE_STRATEGY),
	]);
	expect(results(['note.md', 'secret.md'], match)).toEqual({
		'note.md': { strategy: 'bidirectional' },
		'secret.md': { strategy: NONE_STRATEGY },
	});
});

test('matches single-segment patterns at any depth', () => {
	const match = prepareGlobMatch([
		rule('*', 'bidirectional'),
		rule('*.log', NONE_STRATEGY),
		rule('debug?.txt', NONE_STRATEGY),
		rule('backup[0-9].sql', NONE_STRATEGY),
	]);
	expect(
		results(
			[
				'app.log',
				'notes/app.log',
				'notes/deep/app.log',
				'debug1.txt',
				'debug12.txt',
				'backup5.sql',
				'backupA.sql',
				'keep.txt',
			],
			match,
		),
	).toEqual({
		'app.log': { strategy: NONE_STRATEGY },
		'backup5.sql': { strategy: NONE_STRATEGY },
		'backupA.sql': { strategy: 'bidirectional' },
		'debug1.txt': { strategy: NONE_STRATEGY },
		'debug12.txt': { strategy: 'bidirectional' },
		'keep.txt': { strategy: 'bidirectional' },
		'notes/app.log': { strategy: NONE_STRATEGY },
		'notes/deep/app.log': { strategy: NONE_STRATEGY },
	});
});

test('anchors slash-containing patterns to the vault root', () => {
	const match = prepareGlobMatch([rule('*', 'bidirectional'), rule('doc/*.txt', NONE_STRATEGY)]);
	expect(results(['doc/a.txt', 'doc/deep/a.txt', 'other/doc/a.txt'], match)).toEqual({
		'doc/a.txt': { strategy: NONE_STRATEGY },
		'doc/deep/a.txt': { strategy: 'bidirectional' },
		'other/doc/a.txt': { strategy: 'bidirectional' },
	});
});

test('directory suffixes restrict rules to folders and cover their contents', () => {
	const match = prepareGlobMatch([
		rule('*', 'bidirectional'),
		rule('/vendor/', NONE_STRATEGY),
		rule('build/', NONE_STRATEGY),
	]);
	expect(
		results(
			[
				'vendor/',
				'vendor/a.js',
				'src/vendor/',
				'src/vendor/a.js',
				'build/',
				'build/app.js',
				'x/build/f.js',
			],
			match,
		),
	).toEqual({
		'build/': { advance: false, strategy: NONE_STRATEGY },
		'build/app.js': { strategy: NONE_STRATEGY },
		'src/vendor/': { advance: true, strategy: 'bidirectional' },
		'src/vendor/a.js': { strategy: 'bidirectional' },
		'vendor/': { advance: false, strategy: NONE_STRATEGY },
		'vendor/a.js': { strategy: NONE_STRATEGY },
		'x/build/f.js': { strategy: NONE_STRATEGY },
	});
});

test('probes folders that later rules can reclaim', () => {
	const match = prepareGlobMatch([
		rule('*', 'bidirectional'),
		rule('build/', NONE_STRATEGY),
		rule('build/keep.txt', 'mirrorLocal'),
	]);
	expect(results(['build/', 'build/keep.txt', 'build/other.txt'], match)).toEqual({
		'build/': { advance: true, strategy: NONE_STRATEGY },
		'build/keep.txt': { strategy: 'mirrorLocal' },
		'build/other.txt': { strategy: NONE_STRATEGY },
	});
});

test('rules before the last match cannot reclaim pruned folders', () => {
	const match = prepareGlobMatch([
		rule('build/keep.txt', 'bidirectional'),
		rule('build/', NONE_STRATEGY),
	]);
	expect(results(['build/', 'build/keep.txt'], match)).toEqual({
		'build/': { advance: false, strategy: NONE_STRATEGY },
		'build/keep.txt': { strategy: NONE_STRATEGY },
	});
});

test('matches double-star patterns across directory levels', () => {
	const match = prepareGlobMatch([
		rule('*', 'bidirectional'),
		rule('**/__pycache__/', NONE_STRATEGY),
		rule('assets/**', NONE_STRATEGY),
		rule('a/**/b', NONE_STRATEGY),
	]);
	expect(
		results(
			[
				'__pycache__/',
				'src/utils/__pycache__/',
				'src/utils/__pycache__/x.py',
				'assets/',
				'assets/x/y',
				'a/b',
				'a/x/y/b',
				'x/a/b',
			],
			match,
		),
	).toEqual({
		'__pycache__/': { advance: false, strategy: NONE_STRATEGY },
		'a/b': { strategy: NONE_STRATEGY },
		'a/x/y/b': { strategy: NONE_STRATEGY },
		'assets/': { advance: false, strategy: 'bidirectional' },
		'assets/x/y': { strategy: NONE_STRATEGY },
		'src/utils/__pycache__/': { advance: false, strategy: NONE_STRATEGY },
		'src/utils/__pycache__/x.py': { strategy: NONE_STRATEGY },
		'x/a/b': { strategy: 'bidirectional' },
	});
});

test('prunes subtrees that a later catch-all rule resolves to none', () => {
	const match = prepareGlobMatch([rule('a', 'bidirectional'), rule('a/**', 'none')]);
	expect(results(['/', 'a/', 'a/deep/', 'a/anything.txt'], match)).toEqual({
		'/': { advance: true, strategy: 'none' },
		'a/': { advance: false, strategy: 'bidirectional' },
		'a/anything.txt': { strategy: 'none' },
		'a/deep/': { advance: false, strategy: 'none' },
	});
});

test('resumes advancing past catch-alls when later rules reclaim descendants', () => {
	const match = prepareGlobMatch([
		rule('a', 'bidirectional'),
		rule('a/**', 'none'),
		rule('a/keep.txt', 'mirrorLocal'),
	]);
	expect(results(['a/', 'a/keep.txt', 'a/other.txt'], match)).toEqual({
		'a/': { advance: true, strategy: 'bidirectional' },
		'a/keep.txt': { strategy: 'mirrorLocal' },
		'a/other.txt': { strategy: 'none' },
	});
});

test('prunes the whole vault under a root catch-all', () => {
	const match = prepareGlobMatch([rule('*', 'bidirectional'), rule('/**', 'none')]);
	expect(results(['/', 'x/', 'x/y'], match)).toEqual({
		'/': { advance: false, strategy: 'none' },
		'x/': { advance: false, strategy: 'none' },
		'x/y': { strategy: 'none' },
	});
});

test('advances from the root when later rules can match descendants', () => {
	const match = prepareGlobMatch([
		rule('/vendor/', NONE_STRATEGY),
		rule('/src/**', 'mirrorLocal'),
	]);
	expect(results(['/', 'vendor/', 'src/'], match)).toEqual({
		'/': { advance: true, strategy: NONE_STRATEGY },
		'src/': { advance: true, strategy: NONE_STRATEGY },
		'vendor/': { advance: false, strategy: NONE_STRATEGY },
	});
});

test('prunes when a later identical rule fully shadows an earlier reclaim', () => {
	const match = prepareGlobMatch([
		rule('b/keep.txt', 'mirrorLocal'),
		rule('b/keep.txt', NONE_STRATEGY),
	]);
	expect(results(['b/', 'b/keep.txt'], match)).toEqual({
		'b/': { advance: false, strategy: NONE_STRATEGY },
		'b/keep.txt': { strategy: NONE_STRATEGY },
	});
});

test('prunes when later rules jointly cover every descendant', () => {
	const match = prepareGlobMatch([
		rule('a', 'bidirectional'),
		rule('a/*', NONE_STRATEGY),
		rule('a/*/**', NONE_STRATEGY),
	]);
	expect(results(['a/', 'a/x', 'a/x/y'], match)).toEqual({
		'a/': { advance: false, strategy: 'bidirectional' },
		'a/x': { strategy: NONE_STRATEGY },
		'a/x/y': { strategy: NONE_STRATEGY },
	});
});

test('probes when only files can escape a directory-only shadow', () => {
	const match = prepareGlobMatch([rule('a/*', 'mirrorLocal'), rule('a/*/', NONE_STRATEGY)]);
	expect(results(['a/', 'a/x', 'a/x/', 'a/x/y'], match)).toEqual({
		'a/': { advance: true, strategy: NONE_STRATEGY },
		'a/x': { strategy: 'mirrorLocal' },
		'a/x/': { advance: false, strategy: NONE_STRATEGY },
		'a/x/y': { strategy: NONE_STRATEGY },
	});
});
