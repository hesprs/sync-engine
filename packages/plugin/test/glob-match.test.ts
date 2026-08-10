import { expect, test } from 'bun:test';
import type { GlobMatchRule } from '@/types';
import type { GlobMatchResult } from '@/utils/glob-match';
import { prepareGlobMatch } from '@/utils/glob-match';

const rule = (expr: string, caseSensitive = false): GlobMatchRule => ({
	caseSensitive,
	expr,
});

const results = (paths: Array<string>, matcher: (path: string) => GlobMatchResult) =>
	Object.fromEntries(paths.map((path) => [path, matcher(path)]));

test('includes files and advances through directories without rules', () => {
	const match = prepareGlobMatch();
	expect(results(['/', 'some/file.txt', 'some/'], match)).toEqual({
		'/': 'advance',
		'some/': 'advance',
		'some/file.txt': 'include',
	});
});

test('matches standard wildcards within path segments', () => {
	const match = prepareGlobMatch(
		[],
		[rule('*.log'), rule('debug?.txt'), rule('backup[0-9].sql')],
	);
	expect(
		results(
			['app.log', 'notes/app.log', 'debug1.txt', 'debug12.txt', 'backup5.sql', 'backupA.sql'],
			match,
		),
	).toEqual({
		'app.log': 'exclude',
		'backup5.sql': 'exclude',
		'backupA.sql': 'include',
		'debug1.txt': 'exclude',
		'debug12.txt': 'include',
		'notes/app.log': 'exclude',
	});
});

test('matches path separators, root anchoring, and directory suffixes', () => {
	const match = prepareGlobMatch([], [rule('doc/*.txt'), rule('/vendor/'), rule('build/')]);
	expect(
		results(
			['doc/a.txt', 'doc/deep/a.txt', 'vendor/', 'src/vendor/a.js', 'build/', 'build/app.js'],
			match,
		),
	).toEqual({
		'build/': 'exclude',
		'build/app.js': 'exclude',
		'doc/a.txt': 'exclude',
		'doc/deep/a.txt': 'include',
		'src/vendor/a.js': 'include',
		'vendor/': 'exclude',
	});
});

test('includes unmatched files and advances through unmatched directories with inclusions', () => {
	const match = prepareGlobMatch([rule('docs/**/*.md')]);
	expect(
		results(
			[
				'/',
				'docs/',
				'docs/components/',
				'docs/notes/',
				'docs/readme.md',
				'docs/readme.txt',
				'src/',
			],
			match,
		),
	).toEqual({
		'/': 'advance',
		'docs/': 'advance',
		'docs/components/': 'advance',
		'docs/notes/': 'advance',
		'docs/readme.md': 'include',
		'docs/readme.txt': 'include',
		'src/': 'advance',
	});
});

test('matches double-star patterns across directory levels', () => {
	const match = prepareGlobMatch(
		[],
		[rule('**/__pycache__'), rule('assets/**'), rule('foo/**/bar')],
	);
	expect(
		results(
			[
				'__pycache__/',
				'src/utils/__pycache__/x.py',
				'assets/',
				'assets/x/y',
				'foo/bar',
				'foo/x/y/bar/z',
				'x/foo/bar',
			],
			match,
		),
	).toEqual({
		'__pycache__/': 'exclude',
		'assets/': 'advance',
		'assets/x/y': 'exclude',
		'foo/bar': 'exclude',
		'foo/x/y/bar/z': 'exclude',
		'src/utils/__pycache__/x.py': 'exclude',
		'x/foo/bar': 'include',
	});
});

test('direct inclusion overrides direct and ancestor exclusion', () => {
	const match = prepareGlobMatch(
		[rule('important.log'), rule('build/keep.txt')],
		[rule('*.log'), rule('build/')],
	);
	expect(
		results(
			['important.log', 'build/', 'build/keep.txt', 'build/keep/more.txt', 'build/other.txt'],
			match,
		),
	).toEqual({
		'build/': 'probe',
		'build/keep.txt': 'include',
		'build/keep/more.txt': 'exclude',
		'build/other.txt': 'exclude',
		'important.log': 'include',
	});
});

test('probes excluded directories that may contain included descendants', () => {
	const match = prepareGlobMatch([rule('build/keep.txt')], [rule('build/')]);
	expect(results(['build/', 'build/keep.txt', 'build/other.txt'], match)).toEqual({
		'build/': 'probe',
		'build/keep.txt': 'include',
		'build/other.txt': 'exclude',
	});
});

test('honors case sensitivity per rule', () => {
	const match = prepareGlobMatch([], [rule('README.md'), rule('Secret.txt', true)]);
	expect(results(['readme.md', 'README.md', 'secret.txt', 'Secret.txt'], match)).toEqual({
		'README.md': 'exclude',
		'Secret.txt': 'exclude',
		'readme.md': 'exclude',
		'secret.txt': 'include',
	});
});
