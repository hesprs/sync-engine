import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import type { TaskFactory, TaskNames, TaskOptions } from '@/sync';
import type { FileStat, RecordStat, RecordStatsMap, Stat, StatsMap } from '@/types';
import { bidirectionalDecider, taskMap } from '@/sync';

const { file: kitFile, folder } = testKit;

function file(key: string, uid = `${key}-uid`): FileStat {
	return kitFile(key, { uid });
}

function fileRecord(local: string, remote: string): RecordStat {
	return { isDir: false, local, remote };
}

function folderRecord(): RecordStat {
	return { isDir: true };
}

const NOOP = () => {};
const VOID = {} as never;

type ExtractedTask = {
	name: TaskNames;
	key: string;
	local?: Stat;
	remote?: Stat;
};

function runDecider(input: {
	localStats?: StatsMap;
	remoteStats?: StatsMap;
	records?: RecordStatsMap;
}): Array<ExtractedTask> {
	const localStats = input.localStats ?? new Map<string, Stat>();
	const remoteStats = input.remoteStats ?? new Map<string, Stat>();
	const records = input.records ?? new Map<string, RecordStat>();
	const captured: Array<ExtractedTask> = [];

	const taskFactory = ((name: TaskNames, options: TaskOptions) => {
		const TaskCtor = taskMap[name];
		const task = new TaskCtor({
			...options,
			localFs: VOID,
			record: VOID,
			remoteFs: VOID,
		} as never);
		task.name = name;
		task.prettyName = name;
		captured.push({
			key: options.key,
			name,
			...(options.local !== undefined && { local: options.local }),
			...(options.remote !== undefined && { remote: options.remote }),
		});
		return task;
	}) as TaskFactory;

	bidirectionalDecider({ localStats, logger: NOOP, records, remoteStats, taskFactory });

	return captured;
}

function names(tasks: Array<ExtractedTask>): Array<string> {
	return tasks.map((t) => t.name);
}

function keys(tasks: Array<ExtractedTask>): Array<string> {
	return tasks.map((t) => t.key);
}

/** Asserts exactly one task in the group has the given key, and returns it. */
function keyed(tasks: Array<ExtractedTask>, key: string): ExtractedTask {
	const matching = tasks.filter((t) => t.key === key);
	expect(matching).toHaveLength(1);
	return matching[0];
}

test('file only local, no record → upload', () => {
	const local = file('a.md', 'a-uid');
	const task = keyed(runDecider({ localStats: new Map([['a.md', local]]) }), 'a.md');

	expect(task.name).toBe('upload');
	expect(task.local).toBe(local);
});

test('file only remote, no record → download', () => {
	const remote = file('a.md', 'a-uid');
	const task = keyed(runDecider({ remoteStats: new Map([['a.md', remote]]) }), 'a.md');

	expect(task.name).toBe('download');
	expect(task.remote).toBe(remote);
});

test('file both sides, no record, same size → addRecord', () => {
	const local = file('a.md', 'local-uid');
	const remote = file('a.md', 'remote-uid');
	const task = keyed(
		runDecider({
			localStats: new Map([['a.md', local]]),
			remoteStats: new Map([['a.md', remote]]),
		}),
		'a.md',
	);

	expect(task.name).toBe('addRecord');
	expect(task.local).toBe(local);
	expect(task.remote).toBe(remote);
});

test('file both sides, no record, different size → resolveConflict', () => {
	const local = file('a.md', 'local-uid');
	const remote = { ...file('a.md', 'remote-uid'), size: 999 };
	const task = keyed(
		runDecider({
			localStats: new Map([['a.md', local]]),
			remoteStats: new Map([['a.md', remote]]),
		}),
		'a.md',
	);

	expect(task.name).toBe('resolveConflict');
});

test('file with record, both unchanged → no tasks', () => {
	const local = file('a.md', 'local-uid');
	const remote = file('a.md', 'remote-uid');
	const records: RecordStatsMap = new Map([['a.md', fileRecord('local-uid', 'remote-uid')]]);

	expect(
		runDecider({
			localStats: new Map([['a.md', local]]),
			records,
			remoteStats: new Map([['a.md', remote]]),
		}),
	).toHaveLength(0);
});

test('file with record, both changed → resolveConflict', () => {
	const local = file('a.md', 'new-local');
	const remote = file('a.md', 'new-remote');
	const records: RecordStatsMap = new Map([['a.md', fileRecord('old-local', 'old-remote')]]);
	const task = keyed(
		runDecider({
			localStats: new Map([['a.md', local]]),
			records,
			remoteStats: new Map([['a.md', remote]]),
		}),
		'a.md',
	);

	expect(task.name).toBe('resolveConflict');
	expect(task.local).toBe(local);
	expect(task.remote).toBe(remote);
});

test('file with record, only remote changed → download', () => {
	const local = file('a.md', 'local-uid');
	const remote = file('a.md', 'new-remote');
	const records: RecordStatsMap = new Map([['a.md', fileRecord('local-uid', 'old-remote')]]);
	const task = keyed(
		runDecider({
			localStats: new Map([['a.md', local]]),
			records,
			remoteStats: new Map([['a.md', remote]]),
		}),
		'a.md',
	);

	expect(task.name).toBe('download');
	expect(task.remote).toBe(remote);
});

test('file with record, only local changed → upload', () => {
	const local = file('a.md', 'new-local');
	const remote = file('a.md', 'remote-uid');
	const records: RecordStatsMap = new Map([['a.md', fileRecord('old-local', 'remote-uid')]]);
	const task = keyed(
		runDecider({
			localStats: new Map([['a.md', local]]),
			records,
			remoteStats: new Map([['a.md', remote]]),
		}),
		'a.md',
	);

	expect(task.name).toBe('upload');
	expect(task.local).toBe(local);
});

test('file with record, no remote, local changed → upload', () => {
	const local = file('a.md', 'new-local');
	const records: RecordStatsMap = new Map([['a.md', fileRecord('old-local', 'old-remote')]]);
	const task = keyed(runDecider({ localStats: new Map([['a.md', local]]), records }), 'a.md');

	expect(task.name).toBe('upload');
	expect(task.local).toBe(local);
});

test('file with record, no remote, local unchanged → removeLocal', () => {
	const local = file('a.md', 'local-uid');
	const records: RecordStatsMap = new Map([['a.md', fileRecord('local-uid', 'old-remote')]]);
	const task = keyed(runDecider({ localStats: new Map([['a.md', local]]), records }), 'a.md');

	expect(task.name).toBe('removeLocal');
	expect(task.local).toBe(local);
});

test('file with record, no local, remote changed → download', () => {
	const remote = file('a.md', 'new-remote');
	const records: RecordStatsMap = new Map([['a.md', fileRecord('old-local', 'old-remote')]]);
	const task = keyed(runDecider({ records, remoteStats: new Map([['a.md', remote]]) }), 'a.md');

	expect(task.name).toBe('download');
	expect(task.remote).toBe(remote);
});

test('file with record, no local, remote unchanged → removeRemote', () => {
	const remote = file('a.md', 'remote-uid');
	const records: RecordStatsMap = new Map([['a.md', fileRecord('old-local', 'remote-uid')]]);
	const task = keyed(runDecider({ records, remoteStats: new Map([['a.md', remote]]) }), 'a.md');

	expect(task.name).toBe('removeRemote');
	expect(task.remote).toBe(remote);
});

test('folder only local, no record → createRemoteDir', () => {
	const local = folder('docs/');
	const task = keyed(runDecider({ localStats: new Map([['docs/', local]]) }), 'docs/');

	expect(task.name).toBe('createRemoteDir');
	expect(task.local).toBe(local);
});

test('folder only remote, no record → createLocalDir', () => {
	const remote = folder('docs/');
	const task = keyed(runDecider({ remoteStats: new Map([['docs/', remote]]) }), 'docs/');

	expect(task.name).toBe('createLocalDir');
	expect(task.remote).toBe(remote);
});

test('folder both sides, no record → addRecord', () => {
	const dir = folder('docs/');
	const task = keyed(
		runDecider({
			localStats: new Map([['docs/', dir]]),
			remoteStats: new Map([['docs/', dir]]),
		}),
		'docs/',
	);

	expect(task.name).toBe('addRecord');
});

test('folder with record, both sides unchanged → no tasks', () => {
	const dir = folder('docs/');
	const rec = folderRecord();
	expect(
		runDecider({
			localStats: new Map([['docs/', dir]]),
			records: new Map([['docs/', rec]]),
			remoteStats: new Map([['docs/', dir]]),
		}),
	).toHaveLength(0);
});

test('folder with record, no remote, content changed → createRemoteDir', () => {
	// A new subfile has no record entry → folder detected as changed.
	// The subfile itself also generates an upload task.
	const tasks = runDecider({
		localStats: new Map<string, Stat>([
			['docs/', folder('docs/')],
			['docs/note.md', file('docs/note.md', 'note-uid')],
		]),
		records: new Map([['docs/', folderRecord()]]),
	});

	expect(names(tasks)).toStrictEqual(['upload', 'createRemoteDir']);
	expect(tasks[1].key).toBe('docs/');
});

test('folder with record, no remote, content unchanged → removeLocal', () => {
	// All subfolders have records → isChanged returns false → removeLocal.
	// Both docs/ and docs/sub/ are unchanged folders with no remote.
	const tasks = runDecider({
		localStats: new Map([
			['docs/', folder('docs/')],
			['docs/sub/', folder('docs/sub/')],
		]),
		records: new Map([
			['docs/', folderRecord()],
			['docs/sub/', folderRecord()],
		]),
	});

	expect(names(tasks)).toStrictEqual(['removeLocal', 'removeLocal']);
	expect(tasks[0].key).toBe('docs/');
});

test('folder with record, no local, remote content changed → createLocalDir', () => {
	const tasks = runDecider({
		records: new Map([['docs/', folderRecord()]]),
		remoteStats: new Map<string, Stat>([
			['docs/', folder('docs/')],
			['docs/note.md', file('docs/note.md', 'note-uid')],
		]),
	});

	expect(names(tasks)).toStrictEqual(['download', 'createLocalDir']);
	expect(tasks[1].key).toBe('docs/');
});

test('folder with record, no local, remote content unchanged → removeRemote', () => {
	const tasks = runDecider({
		records: new Map([
			['docs/', folderRecord()],
			['docs/sub/', folderRecord()],
		]),
		remoteStats: new Map([
			['docs/', folder('docs/')],
			['docs/sub/', folder('docs/sub/')],
		]),
	});

	expect(names(tasks)).toStrictEqual(['removeRemote', 'removeRemote']);
	expect(tasks[0].key).toBe('docs/');
});

test('file-folder mismatch, both changed → throws', () => {
	// Record is fileRecord; local=folder, remote=file → both changed (type mismatch)
	expect(() =>
		runDecider({
			localStats: new Map([['item', folder('item')]]),
			records: new Map([['item', fileRecord('local-uid', 'old-remote')]]),
			remoteStats: new Map([['item', file('item', 'remote-uid')]]),
		}),
	).toThrow('Unable to sync: item is a file at remote but a folder at local');
});

test('file-folder mismatch, no record → throws', () => {
	expect(() =>
		runDecider({
			localStats: new Map([['item', folder('item')]]),
			remoteStats: new Map([['item', file('item', 'remote-uid')]]),
		}),
	).toThrow('Unable to sync: item is a file at remote but a folder at local');
});

test('file-folder: local became dir, remote file unchanged → removeRemote + createRemoteDir', () => {
	// Record was fileRecord matching remote uid → remote unchanged, local changed
	const tasks = runDecider({
		localStats: new Map([['item', folder('item')]]),
		records: new Map([['item', fileRecord('local-uid', 'remote-uid')]]),
		remoteStats: new Map([['item', file('item', 'remote-uid')]]),
	});

	expect(names(tasks)).toStrictEqual(['removeRemote', 'createRemoteDir']);
});

test('file-folder: local became file, remote folder unchanged → removeRemote + upload', () => {
	// Record was folderRecord → remote folder unchanged, local changed
	const tasks = runDecider({
		localStats: new Map([['item', file('item', 'new-local')]]),
		records: new Map([['item', folderRecord()]]),
		remoteStats: new Map([['item', folder('item')]]),
	});

	expect(names(tasks)).toStrictEqual(['removeRemote', 'upload']);
});

test('file-folder: remote became dir, local file unchanged → removeLocal + createLocalDir', () => {
	// Record was fileRecord matching local uid → local unchanged, remote changed
	const tasks = runDecider({
		localStats: new Map([['item', file('item', 'local-uid')]]),
		records: new Map([['item', fileRecord('local-uid', 'old-remote')]]),
		remoteStats: new Map([['item', folder('item')]]),
	});

	expect(names(tasks)).toStrictEqual(['removeLocal', 'createLocalDir']);
});

test('file-folder: remote became file, local folder unchanged → removeLocal + download', () => {
	// Record was folderRecord → local folder unchanged, remote changed
	const tasks = runDecider({
		localStats: new Map([['item', folder('item')]]),
		records: new Map([['item', folderRecord()]]),
		remoteStats: new Map([['item', file('item', 'new-remote')]]),
	});

	expect(names(tasks)).toStrictEqual(['removeLocal', 'download']);
});

test('key only in records (deleted from both sides) → removeRecord', () => {
	const records: RecordStatsMap = new Map([['gone.md', fileRecord('local-uid', 'remote-uid')]]);
	const task = keyed(runDecider({ records }), 'gone.md');

	expect(task.name).toBe('removeRecord');
});

test('multiple items produce tasks in file→folder→cleanup order', () => {
	const localStats: StatsMap = new Map<string, Stat>([
		['notes/new.md', file('notes/new.md', 'new-uid')],
		['photos/', folder('photos/')],
	]);
	const remoteStats: StatsMap = new Map([['stale.md', file('stale.md', 'stale-uid')]]);
	const records: RecordStatsMap = new Map([['deleted.md', fileRecord('d-local', 'd-remote')]]);

	const tasks = runDecider({ localStats, records, remoteStats });

	expect(names(tasks)).toStrictEqual(['upload', 'download', 'createRemoteDir', 'removeRecord']);
	expect(keys(tasks)).toStrictEqual(['notes/new.md', 'stale.md', 'photos/', 'deleted.md']);
});

test('empty inputs produce no tasks', () => {
	expect(runDecider({})).toHaveLength(0);
});
