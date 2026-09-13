import { expect, test } from 'bun:test';
import type { BaseTask, TaskNames } from '@/sync';
import type { RecordStatsMap, Stat } from '@/types';
import { convertMoves } from '@/sync';

function file(key: string, uid: string): Stat {
	return { isDir: false, key, mtime: 0, size: 0, uid };
}

function folder(key: string): Stat {
	return { isDir: true, key };
}

function makeTask(input: { name: TaskNames; key: string; local?: Stat; remote?: Stat }): BaseTask {
	const options = {
		key: input.key,
		local: input.local,
		localFs: {},
		record: {},
		remote: input.remote,
		remoteFs: {},
	};
	return {
		exec: () => {},
		key: input.key,
		local: input.local,
		name: input.name,
		options,
		prettyName: input.name,
		remote: input.remote,
	} as BaseTask;
}

function translate(name: TaskNames) {
	return `translated:${name}`;
}

function oldKey(task: BaseTask) {
	return (task.options as { oldKey?: string }).oldKey;
}

test('pairs file tasks using opposite-side record UIDs', () => {
	const tasks = [
		makeTask({ key: 'old.md', local: file('old.md', 'local-old'), name: 'removeLocal' }),
		makeTask({ key: 'new.md', name: 'download', remote: file('new.md', 'remote-new') }),
	];
	const records: RecordStatsMap = new Map([
		['old.md', { isDir: false, local: 'local-old', remote: 'remote-new' }],
	]);

	const [move] = convertMoves(tasks, translate, records);

	expect(move.name).toBe('moveLocal');
	expect(move.key).toBe('new.md');
	expect(oldKey(move)).toBe('old.md');
	expect(move.prettyName).toBe('translated:moveLocal');
});

test('keeps folder tasks when child basenames change', () => {
	const tasks = [
		makeTask({ key: 'old/', local: folder('old/'), name: 'removeLocal' }),
		makeTask({ key: 'new/', name: 'createLocalDir', remote: folder('new/') }),
		makeTask({
			key: 'old/note.md',
			local: file('old/note.md', 'note-local'),
			name: 'removeLocal',
		}),
		makeTask({
			key: 'new/renamed.md',
			name: 'download',
			remote: file('new/renamed.md', 'note-remote'),
		}),
	];
	const records: RecordStatsMap = new Map([
		['old/note.md', { isDir: false, local: 'note-local', remote: 'note-remote' }],
	]);

	const result = convertMoves(tasks, translate, records);

	expect(result.map((task) => task.name)).toStrictEqual([
		'removeLocal',
		'createLocalDir',
		'moveLocal',
	]);
	expect(oldKey(result.find((task) => task.name === 'moveLocal') as BaseTask)).toBe(
		'old/note.md',
	);
});

test('collapses nested folders while retaining child moves', () => {
	const tasks = [
		makeTask({ key: 'old/', local: folder('old/'), name: 'removeLocal' }),
		makeTask({ key: 'new/', name: 'createLocalDir', remote: folder('new/') }),
		makeTask({ key: 'old/nested/', local: folder('old/nested/'), name: 'removeLocal' }),
		makeTask({ key: 'new/nested/', name: 'createLocalDir', remote: folder('new/nested/') }),
		makeTask({
			key: 'old/nested/note.md',
			local: file('old/nested/note.md', 'note-local'),
			name: 'removeLocal',
		}),
		makeTask({
			key: 'new/nested/note.md',
			name: 'download',
			remote: file('new/nested/note.md', 'note-remote'),
		}),
	];
	const records: RecordStatsMap = new Map([
		['old/nested/note.md', { isDir: false, local: 'note-local', remote: 'note-remote' }],
	]);

	const result = convertMoves(tasks, translate, records);

	expect(result.map((task) => [task.name, task.key, oldKey(task)])).toStrictEqual([
		['moveLocal', 'new/nested/note.md', 'old/nested/note.md'],
		['moveLocal', 'new/nested/', 'old/nested/'],
		['moveLocal', 'new/', 'old/'],
	]);
});
