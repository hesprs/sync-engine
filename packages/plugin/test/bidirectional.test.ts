import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import type { RecordStatsMap, Stat, StatsMap } from '@/types';
import { bidirectionalDecider } from '@/sync';

const { file, fileRecord, findTask, folder, folderRecord, runDecider, taskKeys, taskNames } =
	testKit;

test('file only local, no record → upload', () => {
	const local = file('a.md', { uid: 'a-uid' });
	const task = findTask(
		runDecider(bidirectionalDecider, { localStats: new Map([['a.md', local]]) }),
		'a.md',
	);

	expect(task.name).toBe('upload');
	expect(task.local).toBe(local);
});

test('file only remote, no record → download', () => {
	const remote = file('a.md', { uid: 'a-uid' });
	const task = findTask(
		runDecider(bidirectionalDecider, { remoteStats: new Map([['a.md', remote]]) }),
		'a.md',
	);

	expect(task.name).toBe('download');
	expect(task.remote).toBe(remote);
});

test('file both sides, no record, same size → addRecord', () => {
	const local = file('a.md', { uid: 'local-uid' });
	const remote = file('a.md', { uid: 'remote-uid' });
	const task = findTask(
		runDecider(bidirectionalDecider, {
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
	const local = file('a.md', { uid: 'local-uid' });
	const remote = { ...file('a.md', { uid: 'remote-uid' }), size: 999 };
	const task = findTask(
		runDecider(bidirectionalDecider, {
			localStats: new Map([['a.md', local]]),
			remoteStats: new Map([['a.md', remote]]),
		}),
		'a.md',
	);

	expect(task.name).toBe('resolveConflict');
});

test('file with record, both unchanged → no tasks', () => {
	const local = file('a.md', { uid: 'local-uid' });
	const remote = file('a.md', { uid: 'remote-uid' });
	const records: RecordStatsMap = new Map([['a.md', fileRecord('local-uid', 'remote-uid')]]);

	expect(
		runDecider(bidirectionalDecider, {
			localStats: new Map([['a.md', local]]),
			records,
			remoteStats: new Map([['a.md', remote]]),
		}),
	).toHaveLength(0);
});

test('file with record, both changed → resolveConflict', () => {
	const local = file('a.md', { uid: 'new-local' });
	const remote = file('a.md', { uid: 'new-remote' });
	const records: RecordStatsMap = new Map([['a.md', fileRecord('old-local', 'old-remote')]]);
	const task = findTask(
		runDecider(bidirectionalDecider, {
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
	const local = file('a.md', { uid: 'local-uid' });
	const remote = file('a.md', { uid: 'new-remote' });
	const records: RecordStatsMap = new Map([['a.md', fileRecord('local-uid', 'old-remote')]]);
	const task = findTask(
		runDecider(bidirectionalDecider, {
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
	const local = file('a.md', { uid: 'new-local' });
	const remote = file('a.md', { uid: 'remote-uid' });
	const records: RecordStatsMap = new Map([['a.md', fileRecord('old-local', 'remote-uid')]]);
	const task = findTask(
		runDecider(bidirectionalDecider, {
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
	const local = file('a.md', { uid: 'new-local' });
	const records: RecordStatsMap = new Map([['a.md', fileRecord('old-local', 'old-remote')]]);
	const task = findTask(
		runDecider(bidirectionalDecider, { localStats: new Map([['a.md', local]]), records }),
		'a.md',
	);

	expect(task.name).toBe('upload');
	expect(task.local).toBe(local);
});

test('file with record, no remote, local unchanged → removeLocal', () => {
	const local = file('a.md', { uid: 'local-uid' });
	const records: RecordStatsMap = new Map([['a.md', fileRecord('local-uid', 'old-remote')]]);
	const task = findTask(
		runDecider(bidirectionalDecider, { localStats: new Map([['a.md', local]]), records }),
		'a.md',
	);

	expect(task.name).toBe('removeLocal');
	expect(task.local).toBe(local);
});

test('file with record, no local, remote changed → download', () => {
	const remote = file('a.md', { uid: 'new-remote' });
	const records: RecordStatsMap = new Map([['a.md', fileRecord('old-local', 'old-remote')]]);
	const task = findTask(
		runDecider(bidirectionalDecider, { records, remoteStats: new Map([['a.md', remote]]) }),
		'a.md',
	);

	expect(task.name).toBe('download');
	expect(task.remote).toBe(remote);
});

test('file with record, no local, remote unchanged → removeRemote', () => {
	const remote = file('a.md', { uid: 'remote-uid' });
	const records: RecordStatsMap = new Map([['a.md', fileRecord('old-local', 'remote-uid')]]);
	const task = findTask(
		runDecider(bidirectionalDecider, { records, remoteStats: new Map([['a.md', remote]]) }),
		'a.md',
	);

	expect(task.name).toBe('removeRemote');
	expect(task.remote).toBe(remote);
});

test('folder only local, no record → createRemoteDir', () => {
	const local = folder('docs/');
	const task = findTask(
		runDecider(bidirectionalDecider, { localStats: new Map([['docs/', local]]) }),
		'docs/',
	);

	expect(task.name).toBe('createRemoteDir');
	expect(task.local).toBe(local);
});

test('folder only remote, no record → createLocalDir', () => {
	const remote = folder('docs/');
	const task = findTask(
		runDecider(bidirectionalDecider, { remoteStats: new Map([['docs/', remote]]) }),
		'docs/',
	);

	expect(task.name).toBe('createLocalDir');
	expect(task.remote).toBe(remote);
});

test('folder both sides, no record → addRecord', () => {
	const dir = folder('docs/');
	const task = findTask(
		runDecider(bidirectionalDecider, {
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
		runDecider(bidirectionalDecider, {
			localStats: new Map([['docs/', dir]]),
			records: new Map([['docs/', rec]]),
			remoteStats: new Map([['docs/', dir]]),
		}),
	).toHaveLength(0);
});

test('folder with record, no remote, content changed → createRemoteDir', () => {
	// A new subfile has no record entry → folder detected as changed.
	// The subfile itself also generates an upload task.
	const tasks = runDecider(bidirectionalDecider, {
		localStats: new Map<string, Stat>([
			['docs/', folder('docs/')],
			['docs/note.md', file('docs/note.md', { uid: 'note-uid' })],
		]),
		records: new Map([['docs/', folderRecord()]]),
	});

	expect(taskNames(tasks)).toStrictEqual(['upload', 'createRemoteDir']);
	expect(tasks[1].key).toBe('docs/');
});

test('folder with record, no remote, content unchanged → removeLocal', () => {
	// All subfolders have records → isChanged returns false → removeLocal.
	// Both docs/ and docs/sub/ are unchanged folders with no remote.
	const tasks = runDecider(bidirectionalDecider, {
		localStats: new Map([
			['docs/', folder('docs/')],
			['docs/sub/', folder('docs/sub/')],
		]),
		records: new Map([
			['docs/', folderRecord()],
			['docs/sub/', folderRecord()],
		]),
	});

	expect(taskNames(tasks)).toStrictEqual(['removeLocal', 'removeLocal']);
	expect(tasks[0].key).toBe('docs/');
});

test('folder with record, no local, remote content changed → createLocalDir', () => {
	const tasks = runDecider(bidirectionalDecider, {
		records: new Map([['docs/', folderRecord()]]),
		remoteStats: new Map<string, Stat>([
			['docs/', folder('docs/')],
			['docs/note.md', file('docs/note.md', { uid: 'note-uid' })],
		]),
	});

	expect(taskNames(tasks)).toStrictEqual(['download', 'createLocalDir']);
	expect(tasks[1].key).toBe('docs/');
});

test('folder with record, no local, remote content unchanged → removeRemote', () => {
	const tasks = runDecider(bidirectionalDecider, {
		records: new Map([
			['docs/', folderRecord()],
			['docs/sub/', folderRecord()],
		]),
		remoteStats: new Map([
			['docs/', folder('docs/')],
			['docs/sub/', folder('docs/sub/')],
		]),
	});

	expect(taskNames(tasks)).toStrictEqual(['removeRemote', 'removeRemote']);
	expect(tasks[0].key).toBe('docs/');
});

test('file-folder mismatch, both changed → throws', () => {
	// Record is fileRecord; local=folder, remote=file → both changed (type mismatch)
	expect(() =>
		runDecider(bidirectionalDecider, {
			localStats: new Map([['item', folder('item')]]),
			records: new Map([['item', fileRecord('local-uid', 'old-remote')]]),
			remoteStats: new Map([['item', file('item', { uid: 'remote-uid' })]]),
		}),
	).toThrow('Unable to sync: item is a file at remote but a folder at local');
});

test('file-folder mismatch, no record → throws', () => {
	expect(() =>
		runDecider(bidirectionalDecider, {
			localStats: new Map([['item', folder('item')]]),
			remoteStats: new Map([['item', file('item', { uid: 'remote-uid' })]]),
		}),
	).toThrow('Unable to sync: item is a file at remote but a folder at local');
});

test('file-folder: local became dir, remote file unchanged → removeRemote + createRemoteDir', () => {
	// Record was fileRecord matching remote uid → remote unchanged, local changed
	const tasks = runDecider(bidirectionalDecider, {
		localStats: new Map([['item', folder('item')]]),
		records: new Map([['item', fileRecord('local-uid', 'remote-uid')]]),
		remoteStats: new Map([['item', file('item', { uid: 'remote-uid' })]]),
	});

	expect(taskNames(tasks)).toStrictEqual(['removeRemote', 'createRemoteDir']);
});

test('file-folder: local became file, remote folder unchanged → removeRemote + upload', () => {
	// Record was folderRecord → remote folder unchanged, local changed
	const tasks = runDecider(bidirectionalDecider, {
		localStats: new Map([['item', file('item', { uid: 'new-local' })]]),
		records: new Map([['item', folderRecord()]]),
		remoteStats: new Map([['item', folder('item')]]),
	});

	expect(taskNames(tasks)).toStrictEqual(['removeRemote', 'upload']);
});

test('file-folder: remote became dir, local file unchanged → removeLocal + createLocalDir', () => {
	// Record was fileRecord matching local uid → local unchanged, remote changed
	const tasks = runDecider(bidirectionalDecider, {
		localStats: new Map([['item', file('item', { uid: 'local-uid' })]]),
		records: new Map([['item', fileRecord('local-uid', 'old-remote')]]),
		remoteStats: new Map([['item', folder('item')]]),
	});

	expect(taskNames(tasks)).toStrictEqual(['removeLocal', 'createLocalDir']);
});

test('file-folder: remote became file, local folder unchanged → removeLocal + download', () => {
	// Record was folderRecord → local folder unchanged, remote changed
	const tasks = runDecider(bidirectionalDecider, {
		localStats: new Map([['item', folder('item')]]),
		records: new Map([['item', folderRecord()]]),
		remoteStats: new Map([['item', file('item', { uid: 'new-remote' })]]),
	});

	expect(taskNames(tasks)).toStrictEqual(['removeLocal', 'download']);
});

test('key only in records (deleted from both sides) → removeRecord', () => {
	const records: RecordStatsMap = new Map([['gone.md', fileRecord('local-uid', 'remote-uid')]]);
	const task = findTask(runDecider(bidirectionalDecider, { records }), 'gone.md');

	expect(task.name).toBe('removeRecord');
});

test('multiple items produce tasks in file→folder→cleanup order', () => {
	const localStats: StatsMap = new Map<string, Stat>([
		['notes/new.md', file('notes/new.md', { uid: 'new-uid' })],
		['photos/', folder('photos/')],
	]);
	const remoteStats: StatsMap = new Map([['stale.md', file('stale.md', { uid: 'stale-uid' })]]);
	const records: RecordStatsMap = new Map([['deleted.md', fileRecord('d-local', 'd-remote')]]);

	const tasks = runDecider(bidirectionalDecider, { localStats, records, remoteStats });

	expect(taskNames(tasks)).toStrictEqual([
		'upload',
		'download',
		'createRemoteDir',
		'removeRecord',
	]);
	expect(taskKeys(tasks)).toStrictEqual(['notes/new.md', 'stale.md', 'photos/', 'deleted.md']);
});

test('empty inputs produce no tasks', () => {
	expect(runDecider(bidirectionalDecider, {})).toHaveLength(0);
});
