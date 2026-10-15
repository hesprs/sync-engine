import type {
	FileStat,
	Fs,
	FsWrapperEntry,
	OptimizerEntry,
	WriteAtom,
	SettingEntry,
	Stat,
	Translate,
} from '@hesprs/sync-engine-sdk';
import S3Rclone from '@';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import { en } from '@/i18n';
import RcloneFs from '@/remote';

const { bytes, file, folder, fs: testFs, stream } = testKit;
const MS = 1_700_000_123_456;
const SECONDS = '1700000123.456';
const CTIME = '1600000123456';
const ENCRYPTED = 'dGVzdC1lbmNyeXB0ZWQtbXRpbWU=';

function adapter(original: Fs, needDirFix = true, ignoreEtags = false) {
	return new RcloneFs(original, needDirFix, ignoreEtags);
}

function listing(stats: Array<Stat>, uid = 's3~test') {
	return testFs({
		control: {
			list: async (_key, reporter) => {
				const result: Array<Stat> = [];
				for (const [index, stat] of stats.entries())
					if (
						(await reporter({
							completed: index + 1,
							current: stat.key,
							total: stats.length,
						})) !== 'exclude'
					)
						result.push(stat);
				return result;
			},
		},
		uid,
	});
}

async function fileStat(fs: Fs, key: string): Promise<FileStat> {
	const stat = await fs.stat(key);
	if (stat.isDir) throw new Error('Expected a file stat');
	return stat;
}

test.each(['write', 'writeStream'] as const)(
	'%s converts mtime milliseconds to rclone seconds',
	async (method) => {
		const meta = { ctime: CTIME, custom: 'value', mtime: String(MS) };
		const source = file('note.md', { meta: () => meta, mtime: MS });
		const backend = testFs({
			control: {
				write: async (_key, _value, stat) => {
					expect(await stat.meta()).toEqual({ ...meta, mtime: SECONDS });
					return 'written';
				},
				writeStream: async (_key, _value, stat) => {
					expect(await stat.meta()).toEqual({ ...meta, mtime: SECONDS });
					return 'written';
				},
			},
		});
		const fs = adapter(backend.fs);
		const uid =
			method === 'write'
				? await fs.write(source.key, bytes('note'), source)
				: await fs.writeStream(source.key, stream(['note']), source);
		expect(uid).toBe('written');
		expect(await source.meta()).toEqual(meta);
	},
);

test('write preserves non-numeric mtime (encrypted meta) unchanged', async () => {
	const meta = { mtime: ENCRYPTED };
	const source = file('note.md', { meta: () => meta });
	const backend = testFs({
		control: {
			write: async (_key, _value, stat) => {
				expect(await stat.meta()).toEqual({ mtime: ENCRYPTED });
				return 'written';
			},
		},
	});
	const fs = adapter(backend.fs);
	await fs.write(source.key, bytes('note'), source);
});

test('write supplies mtime from the file stat when metadata omits it', async () => {
	const backend = testFs();
	await adapter(backend.fs).write('note.md', bytes('note'), file('note.md', { mtime: MS }));
	expect(await backend.calls.write[0][2].meta()).toEqual({ mtime: SECONDS });
});

test('stat converts mtime seconds back to milliseconds', async () => {
	const source = file('note.md', {
		meta: () => ({ ctime: CTIME, mtime: SECONDS }),
		mtime: 0,
		uid: 'remote-uid',
	});
	const fs = adapter(testFs({ control: { stat: () => source } }).fs);
	const stat = await fileStat(fs, source.key);
	expect(await stat.meta()).toEqual({ ctime: CTIME, mtime: String(MS) });
	expect(stat.mtime).toBe(0);
	expect(stat.uid).toBe('remote-uid');
});

test('stat preserves non-numeric mtime (encrypted meta) unchanged', async () => {
	const source = file('note.md', { meta: () => ({ mtime: ENCRYPTED }) });
	const fs = adapter(testFs({ control: { stat: () => source } }).fs);
	const stat = await fileStat(fs, source.key);
	expect(await stat.meta()).toEqual({ mtime: ENCRYPTED });
});

test('stat leaves folders unchanged', async () => {
	const fs = adapter(testFs({ control: { stat: () => folder('dir/') } }).fs);
	expect(await fs.stat('dir/')).toEqual(folder('dir/'));
});

test('list infers folders, converts timestamps, and reports through the reporter', async () => {
	const backend = listing([
		file('vault/notes/nested/note.md', { meta: () => ({ mtime: SECONDS }), mtime: MS }),
	]);
	const fs = adapter(backend.fs);
	const reported: Array<string> = [];
	const stats = await fs.list('vault/notes/', (progress) => {
		reported.push(progress.current);
		return 'include';
	});
	expect(stats.map((s) => s.key)).toEqual(['vault/notes/nested/note.md', 'vault/notes/nested/']);
	expect(reported).toEqual(['vault/notes/nested/note.md', 'vault/notes/nested/']);
	expect(await stats[0].meta()).toEqual({ mtime: String(MS) });
});

test('list restores its precise mtime without metadata and overrides numeric HEAD/GET times', async () => {
	const backend = listing([
		file('plain.md', { mtime: MS }),
		file('stale.md', { meta: () => ({ ctime: CTIME, mtime: '1' }), mtime: MS }),
		file('encrypted.md', { meta: () => ({ mtime: ENCRYPTED }), mtime: MS }),
	]);
	const stats = await adapter(backend.fs).list('/', () => 'include');
	expect(await Promise.all(stats.map(async (stat) => stat.meta()))).toEqual([
		{ mtime: String(MS) },
		{ ctime: CTIME, mtime: String(MS) },
		{ mtime: ENCRYPTED },
	]);
});

test.each(['write', 'writeStream'] as const)(
	'%s ignores upload ETags and returns the next LIST uid',
	async (method) => {
		const source = file('notes/note.md', { mtime: MS, size: 4, uid: 'list-etag' });
		const backend = listing([source, file('notes/note.md.bak')]);
		backend.control.write = () => 'put-etag';
		backend.control.writeStream = () => 'multipart-etag';
		const fs = adapter(backend.fs, false, true);
		const uid =
			method === 'write'
				? await fs.write(source.key, bytes('note'), source)
				: await fs.writeStream(source.key, stream(['note']), source);
		const [next] = await fs.list('notes/', () => 'include');
		if (next.isDir) throw new Error('Expected a file stat');
		expect(uid).toBe(`${MS}~4`);
		expect(next.uid).toBe(uid);
		expect(backend.calls.list).toEqual([source.key, 'notes/']);
		expect(backend.calls.stat).toEqual([]);
	},
);

test.each([
	['mixed parents', ['notes/a.md', 'notes/b.md', 'other/c.md'], ['notes/', 'other/c.md'], ''],
	['upload failure', ['notes/a.md', 'notes/b.md'], ['notes/'], 'upload'],
	['listing failure', ['notes/a.md', 'notes/b.md'], ['notes/'], 'list'],
	['skipped read', ['notes/a.md', 'notes/b.md'], ['notes/b.md'], 'skip'],
] as const)(
	'%s selects upload listing prefixes and settles independently',
	async (_name, keys, prefixes, fail) => {
		const sources = keys.map((key) => file(key, { mtime: MS, size: 4 }));
		const backend = listing(sources);
		const error = new Error('backend failed');
		backend.control.write = backend.control.writeStream = (key) => {
			if (fail === 'upload' && key === keys[0]) throw error;
			return 'etag';
		};
		if (fail === 'list')
			backend.control.list = () => {
				throw error;
			};
		const fs = adapter(backend.fs, false, true);
		for (const source of sources) await fs.read(source.key, source);
		if (fail === 'skip') fs.finishUpload(keys[0]);
		fs.prepareUploads(
			keys.map((key): WriteAtom => ({
				execute: () => '',
				key,
				reject: () => {},
				resolve: () => {},
				type: 'write',
			})),
		);
		const uploads = fail === 'skip' ? sources.slice(1) : sources;
		const results = await Promise.allSettled(
			uploads.map((source) => fs.write(source.key, bytes('note'), source)),
		);
		const expected = uploads.map(({ key }): PromiseSettledResult<string> => {
			const failed = fail === 'list' || (fail === 'upload' && key === keys[0]);
			if (failed) return { reason: error, status: 'rejected' };
			return { status: 'fulfilled', value: `${MS}~4` };
		});
		expect(results).toEqual(expected);
		expect(backend.calls.list.toSorted()).toEqual([...prefixes].toSorted());
	},
);

test('stat ignores HEAD ETags and its differing timestamp when the toggle is enabled', async () => {
	const key = 'notes/note.md';
	const backend = listing([file(key, { mtime: MS, size: 4, uid: 'list-etag' })]);
	backend.control.stat = () => file(key, { mtime: MS + 86_400_000, uid: 'head-etag' });
	const stat = await fileStat(adapter(backend.fs, true, true), key);
	expect(stat.uid).toBe(`${MS}~4`);
	expect(await stat.meta()).toEqual({ mtime: String(MS) });
	expect(backend.calls.stat).toEqual([]);
	expect(backend.calls.list).toEqual([key]);
});

test('stat reports missing listing entries as 404 with ETags ignored', () => {
	expect(adapter(listing([]).fs, true, true).stat('missing.md')).rejects.toMatchObject({
		status: 404,
	});
});

test('list excludes reporter-rejected folders and does not duplicate existing entries', async () => {
	const backend = listing([
		folder('notes/nested/'),
		file('notes/nested/note.md', { meta: () => ({ mtime: SECONDS }) }),
	]);
	const fs = adapter(backend.fs);
	const stats = await fs.list('/', (progress) =>
		progress.current === 'notes/' ? 'exclude' : 'include',
	);
	expect(stats.map((s) => s.key)).toEqual(['notes/nested/', 'notes/nested/note.md']);
});

test('mkdir is a no-op', async () => {
	const backend = testFs();
	const fs = adapter(backend.fs);
	await fs.mkdir('empty/nested/', folder('empty/nested/'), true);
	await fs.mkdir('/', folder('/'), true);
	expect(backend.calls.mkdir).toEqual([]);
});

test('move skips folder keys but forwards file moves', async () => {
	const backend = testFs();
	const fs = adapter(backend.fs);
	await fs.move('old/', 'new/');
	await fs.move('old/note.md', 'new/note.md');
	expect(backend.calls.move).toEqual([['old/note.md', 'new/note.md']]);
});

test('with needDirFix=false, mkdir forwards and list skips inference', async () => {
	const backend = testFs({
		control: {
			list: () => [file('notes/note.md', { meta: () => ({ mtime: SECONDS }) })],
		},
	});
	const fs = adapter(backend.fs, false);
	await fs.mkdir('notes/', folder('notes/'));
	expect(backend.calls.mkdir).toHaveLength(1);
	const stats = await fs.list('/', () => 'advance');
	expect(stats.map((s) => s.key)).toEqual(['notes/note.md']);
});

test('with needDirFix=false, move forwards folder keys', async () => {
	const backend = testFs();
	const fs = adapter(backend.fs, false);
	await fs.move('old/', 'new/');
	expect(backend.calls.move).toEqual([['old/', 'new/']]);
});

test('module registers wrapper and settings, applies the toggle, and cleans up', async () => {
	const wrappers: Array<FsWrapperEntry> = [];
	const optimizers: Array<OptimizerEntry> = [];
	const settingsEntries: Array<SettingEntry> = [];
	const settings = { asymmetricStorage: false, remoteFs: 's3' };
	const module = new S3Rclone({
		on: () => () => {},
		registerI18n: () => {},
		registerRemoteFsWrapper: (entry) => {
			wrappers.push(entry);
			return () => wrappers.splice(wrappers.indexOf(entry), 1);
		},
		registerRemoteOptimizer: (entry) => {
			optimizers.push(entry);
			return () => optimizers.splice(optimizers.indexOf(entry), 1);
		},
		registerSetting: (entry) => {
			settingsEntries.push(entry);
			return () => settingsEntries.splice(settingsEntries.indexOf(entry), 1);
		},
		saveSettings: async () => {},
		settings,
		translate: ((key: keyof typeof en) => en[key]) as Translate<typeof en>,
	});
	module.start();
	expect(wrappers).toHaveLength(1);
	expect(optimizers).toHaveLength(1);
	expect(wrappers[0].priority).toBe(2500);
	expect(settingsEntries).toHaveLength(1);
	expect(module.moduleSettings.ignoreEtags).toBe(false);
	const s3Backend = testFs({ uid: 's3~test' }).fs;
	expect(wrappers[0].apply(s3Backend)).toBeInstanceOf(RcloneFs);
	module.moduleSettings.ignoreEtags = true;
	const wrapped = wrappers[0].apply(listing([file('note.md', { mtime: MS, size: 4 })]).fs);
	if (!wrapped) throw new Error('Expected rclone wrapper');
	expect((await fileStat(wrapped, 'note.md')).uid).toBe(`${MS}~4`);
	settings.remoteFs = 'webdav';
	expect(wrappers[0].apply(s3Backend)).toBeUndefined();
	settings.remoteFs = 's3';
	const otherBackend = testFs({ uid: 'webdav~test' }).fs;
	expect(wrappers[0].apply(otherBackend)).toBeUndefined();
	module.dispose();
	expect(wrappers).toEqual([]);
	expect(optimizers).toEqual([]);
	expect(settingsEntries).toEqual([]);
});
