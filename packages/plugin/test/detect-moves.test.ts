import testKit from '$/test-kit';
import { convertMoves } from '@/sync';
import { expect, test } from 'bun:test';
import type { Task, TaskNames } from '@/sync';
import type { RecordStatsMap, Stat } from '@/types';

const { file, folder } = testKit;

function makeTask(input: { name: TaskNames; key: string; local?: Stat; remote?: Stat }): Task {
	const options = {
		key: input.key,
		local: input.local,
		localFs: {},
		record: {},
		remote: input.remote,
		remoteFs: {},
	};
	return { ...input, exec: () => {}, options } as Task;
}

function newKey({ options }: Task) {
	return (options as { newKey: string }).newKey;
}

test('pairs file tasks using opposite-side record UIDs', () => {
	const tasks = [
		makeTask({
			key: 'old.md',
			local: file('old.md', { uid: 'local-old' }),
			name: 'removeLocal',
		}),
		makeTask({
			key: 'new.md',
			name: 'download',
			remote: file('new.md', { uid: 'remote-new' }),
		}),
	];
	const records: RecordStatsMap = new Map([
		['old.md', { isDir: false, local: 'local-old', remote: 'remote-new' }],
	]);

	const [move] = convertMoves(tasks, records);

	expect(move.name).toBe('moveLocal');
	expect(newKey(move)).toBe('new.md');
	expect(move.key).toBe('old.md');
});

test('keeps folder tasks when child basenames change', () => {
	const tasks = [
		makeTask({ key: 'old/', local: folder('old/'), name: 'removeLocal' }),
		makeTask({ key: 'new/', name: 'createLocalDir', remote: folder('new/') }),
		makeTask({
			key: 'old/note.md',
			local: file('old/note.md', { uid: 'note-local' }),
			name: 'removeLocal',
		}),
		makeTask({
			key: 'new/renamed.md',
			name: 'download',
			remote: file('new/renamed.md', { uid: 'note-remote' }),
		}),
	];
	const records: RecordStatsMap = new Map([
		['old/note.md', { isDir: false, local: 'note-local', remote: 'note-remote' }],
	]);

	const result = convertMoves(tasks, records);

	expect(result.map((task) => task.name)).toStrictEqual([
		'removeLocal',
		'createLocalDir',
		'moveLocal',
	]);
	expect(result.find((task) => task.name === 'moveLocal')?.key).toBe('old/note.md');
});

test('collapses nested folders while retaining child moves', () => {
	const tasks = [
		makeTask({ key: 'old/', local: folder('old/'), name: 'removeLocal' }),
		makeTask({ key: 'new/', name: 'createLocalDir', remote: folder('new/') }),
		makeTask({ key: 'old/nested/', local: folder('old/nested/'), name: 'removeLocal' }),
		makeTask({ key: 'new/nested/', name: 'createLocalDir', remote: folder('new/nested/') }),
		makeTask({
			key: 'old/nested/note.md',
			local: file('old/nested/note.md', { uid: 'note-local' }),
			name: 'removeLocal',
		}),
		makeTask({
			key: 'new/nested/note.md',
			name: 'download',
			remote: file('new/nested/note.md', { uid: 'note-remote' }),
		}),
	];
	const records: RecordStatsMap = new Map([
		['old/nested/note.md', { isDir: false, local: 'note-local', remote: 'note-remote' }],
	]);

	const result = convertMoves(tasks, records);

	expect(result.map((task) => [task.name, newKey(task), task.key])).toStrictEqual([
		['moveLocal', 'new/nested/note.md', 'old/nested/note.md'],
		['moveLocal', 'new/nested/', 'old/nested/'],
		['moveLocal', 'new/', 'old/'],
	]);
});
