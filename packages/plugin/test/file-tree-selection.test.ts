import testKit from '$/test-kit';
import createFileTreeSelection from '@/components/file-tree/selection';
import createFileTreeData from '@/components/file-tree/tree-data';
import { taskMap } from '@/sync';
import { expect, test } from 'bun:test';
import type { Task, TaskNames } from '@/sync';
import type { Stat } from '@/types';

const { file, folder } = testKit;

function makeTask(input: {
	name: TaskNames;
	key: string;
	newKey?: string;
	local?: Stat;
	remote?: Stat;
}): Task {
	return new taskMap[input.name]({
		...input,
		localFs: {} as never,
		record: {} as never,
		remoteFs: {} as never,
	} as never);
}

function createSelection(tasks: Array<Task>) {
	return createFileTreeSelection(createFileTreeData(tasks));
}

function describeTask({ key, name }: Task): [string, string] {
	return [name, key];
}

test('deselecting child delete task deselects ancestor delete tasks recursively', () => {
	const selection = createSelection([
		makeTask({ key: 'folder/', local: folder('folder/'), name: 'removeLocal' }),
		makeTask({ key: 'folder/nested/', local: folder('folder/nested/'), name: 'removeLocal' }),
		makeTask({
			key: 'folder/nested/note.md',
			local: file('folder/nested/note.md'),
			name: 'removeLocal',
		}),
	]);

	selection.toggle('folder/nested/note.md', false);

	expect(selection.isSelected('folder')).toBe(false);
	expect(selection.isSelected('folder/nested')).toBe(false);
	expect(selection.isSelected('folder/nested/note.md')).toBe(false);
});

test('selecting parent delete task selects descendant delete tasks recursively', () => {
	const selection = createSelection([
		makeTask({ key: 'folder/', local: folder('folder/'), name: 'removeLocal' }),
		makeTask({ key: 'folder/nested/', local: folder('folder/nested/'), name: 'removeLocal' }),
		makeTask({
			key: 'folder/nested/note.md',
			local: file('folder/nested/note.md'),
			name: 'removeLocal',
		}),
	]);

	selection.toggle('folder/nested', false);
	selection.toggle('folder', false);
	selection.toggle('folder', true);

	expect(selection.isSelected('folder')).toBe(true);
	expect(selection.isSelected('folder/nested')).toBe(true);
	expect(selection.isSelected('folder/nested/note.md')).toBe(true);
});

test('deselecting create or move folder task deselects descendant create and move tasks recursively', () => {
	const selection = createSelection([
		makeTask({ key: 'folder/', name: 'createLocalDir', remote: folder('folder/') }),
		makeTask({
			key: 'folder/nested/',
			name: 'moveLocal',
			newKey: 'moved/nested/',
			remote: folder('folder/nested/'),
		}),
		makeTask({
			key: 'folder/nested/deeper/',
			name: 'createLocalDir',
			remote: folder('folder/nested/deeper/'),
		}),
	]);

	selection.toggle('folder', false);

	expect(selection.isSelected('folder')).toBe(false);
	expect(selection.isSelected('folder/nested')).toBe(false);
	expect(selection.isSelected('folder/nested/deeper')).toBe(false);
});

test('selecting child create or move task selects ancestor create-folder tasks recursively', () => {
	const selection = createSelection([
		makeTask({ key: 'folder/', name: 'createLocalDir', remote: folder('folder/') }),
		makeTask({
			key: 'folder/nested/',
			name: 'createLocalDir',
			remote: folder('folder/nested/'),
		}),
		makeTask({
			key: 'folder/nested/deeper/',
			name: 'moveLocal',
			newKey: 'moved/deeper/',
			remote: folder('folder/nested/deeper/'),
		}),
	]);

	selection.toggle('folder', false);
	selection.toggle('folder/nested', false);
	selection.toggle('folder/nested/deeper', false);
	selection.toggle('folder/nested/deeper', true);

	expect(selection.isSelected('folder')).toBe(true);
	expect(selection.isSelected('folder/nested')).toBe(true);
	expect(selection.isSelected('folder/nested/deeper')).toBe(true);
});

test('treats move-folder tasks as creation tasks in mixed cascades', () => {
	const selection = createSelection([
		makeTask({ key: 'folder/', name: 'createLocalDir', remote: folder('folder/') }),
		makeTask({
			key: 'folder/nested/',
			name: 'moveLocal',
			newKey: 'moved/nested/',
			remote: folder('folder/nested/'),
		}),
	]);

	selection.toggle('folder', false);
	selection.toggle('folder/nested', false);
	selection.toggle('folder/nested', true);
	expect(selection.isSelected('folder')).toBe(true);

	selection.toggle('folder', false);

	expect(selection.isSelected('folder')).toBe(false);
	expect(selection.isSelected('folder/nested')).toBe(false);
});

test('getState returns selected and deselected task arrays using blueprint names', () => {
	const folderTask = makeTask({
		key: 'folder/',
		name: 'createLocalDir',
		remote: folder('folder/'),
	});
	const fileTask = makeTask({
		key: 'folder/note.md',
		local: file('folder/note.md'),
		name: 'upload',
	});
	const selection = createSelection([folderTask, fileTask]);

	selection.toggle('folder', false);

	expect(selection.getState()).toStrictEqual({
		deselected: [folderTask, fileTask],
		selected: [],
	});
});

test('selecting descendant file task restores required ancestor create-folder tasks', () => {
	const selection = createSelection([
		makeTask({ key: 'folder/', name: 'createLocalDir', remote: folder('folder/') }),
		makeTask({ key: 'folder/note.md', local: file('folder/note.md'), name: 'upload' }),
	]);

	selection.toggle('folder', false);
	selection.toggle('folder/note.md', true);

	expect(selection.isSelected('folder')).toBe(true);
	expect(selection.isSelected('folder/note.md')).toBe(true);
});

test('deselecting direct child move task converts parent move task into create-dir task', () => {
	const parent = makeTask({
		key: 'folder/',
		name: 'moveLocal',
		newKey: 'moved/',
		remote: folder('folder/'),
	});
	const child = makeTask({
		key: 'folder/note.md',
		name: 'moveLocal',
		newKey: 'moved/note.md',
		remote: file('folder/note.md'),
	});
	const selection = createSelection([parent, child]);

	selection.toggle('folder/note.md', false);

	expect(selection.isSelected('folder')).toBe(true);
	expect(selection.getState().selected.map(describeTask)).toStrictEqual([
		['createLocalDir', 'moved/'],
	]);
	expect(selection.getState().deselected).toStrictEqual([child]);
});

test('conversion cascades through ancestor move tasks', () => {
	const parent = makeTask({ key: 'a/', name: 'moveLocal', newKey: 'x/', remote: folder('a/') });
	const child = makeTask({
		key: 'a/b/',
		name: 'moveLocal',
		newKey: 'x/b/',
		remote: folder('a/b/'),
	});
	const grandChild = makeTask({
		key: 'a/b/c.md',
		name: 'moveLocal',
		newKey: 'x/b/c.md',
		remote: file('a/b/c.md'),
	});
	const selection = createSelection([parent, child, grandChild]);

	selection.toggle('a/b/c.md', false);

	expect(selection.getState().selected.map(describeTask)).toStrictEqual([
		['createLocalDir', 'x/'],
		['createLocalDir', 'x/b/'],
	]);
	expect(selection.getState().deselected).toStrictEqual([grandChild]);
});

test('selecting all direct child move tasks converts converted create-dir task back to move task', () => {
	const parent = makeTask({ key: 'a/', name: 'moveLocal', newKey: 'x/', remote: folder('a/') });
	const child = makeTask({
		key: 'a/b/',
		name: 'moveLocal',
		newKey: 'x/b/',
		remote: folder('a/b/'),
	});
	const grandChild = makeTask({
		key: 'a/b/c.md',
		name: 'moveLocal',
		newKey: 'x/b/c.md',
		remote: file('a/b/c.md'),
	});
	const selection = createSelection([parent, child, grandChild]);

	selection.toggle('a/b/c.md', false);
	selection.toggle('a/b/c.md', true);

	expect(selection.getState()).toStrictEqual({
		deselected: [],
		selected: [parent, child, grandChild],
	});
});
