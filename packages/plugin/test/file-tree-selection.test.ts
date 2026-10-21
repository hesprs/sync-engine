import createFileTreeSelection from '@/components/file-tree/selection';
import createFileTreeData from '@/components/file-tree/tree-data';
import { expect, test } from 'bun:test';
import type { BaseTask, TaskNames } from '@/sync';

function makeTask(input: {
	name: TaskNames;
	key: string;
	localIsDir?: boolean;
	remoteIsDir?: boolean;
	prettyName?: string;
}): BaseTask {
	return {
		exec: () => {},
		key: input.key,
		local: input.localIsDir === undefined ? undefined : ({ isDir: input.localIsDir } as never),
		name: input.name,
		prettyName: input.prettyName ?? input.name,
		remote:
			input.remoteIsDir === undefined ? undefined : ({ isDir: input.remoteIsDir } as never),
	} as BaseTask;
}

function createSelection(tasks: Array<BaseTask>) {
	return createFileTreeSelection(createFileTreeData(tasks));
}

test('deselecting child delete task deselects ancestor delete tasks recursively', () => {
	const selection = createSelection([
		makeTask({ key: 'folder', localIsDir: true, name: 'removeLocal' }),
		makeTask({ key: 'folder/nested', localIsDir: true, name: 'removeLocal' }),
		makeTask({ key: 'folder/nested/note.md', name: 'removeLocal' }),
	]);

	selection.toggle('folder/nested/note.md', false);

	expect(selection.isSelected('folder')).toBe(false);
	expect(selection.isSelected('folder/nested')).toBe(false);
	expect(selection.isSelected('folder/nested/note.md')).toBe(false);
});

test('selecting parent delete task selects descendant delete tasks recursively', () => {
	const selection = createSelection([
		makeTask({ key: 'folder', localIsDir: true, name: 'removeLocal' }),
		makeTask({ key: 'folder/nested', localIsDir: true, name: 'removeLocal' }),
		makeTask({ key: 'folder/nested/note.md', name: 'removeLocal' }),
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
		makeTask({ key: 'folder', localIsDir: true, name: 'createLocalDir' }),
		makeTask({ key: 'folder/nested', name: 'moveLocal', remoteIsDir: true }),
		makeTask({ key: 'folder/nested/deeper', localIsDir: true, name: 'createLocalDir' }),
	]);

	selection.toggle('folder', false);

	expect(selection.isSelected('folder')).toBe(false);
	expect(selection.isSelected('folder/nested')).toBe(false);
	expect(selection.isSelected('folder/nested/deeper')).toBe(false);
});

test('selecting child create or move task selects ancestor create-folder tasks recursively', () => {
	const selection = createSelection([
		makeTask({ key: 'folder', localIsDir: true, name: 'createLocalDir' }),
		makeTask({ key: 'folder/nested', localIsDir: true, name: 'createLocalDir' }),
		makeTask({ key: 'folder/nested/deeper', name: 'moveLocal', remoteIsDir: true }),
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
		makeTask({ key: 'folder', localIsDir: true, name: 'createLocalDir' }),
		makeTask({ key: 'folder/nested', name: 'moveLocal', remoteIsDir: true }),
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
	const folder = makeTask({ key: 'folder', localIsDir: true, name: 'createLocalDir' });
	const file = makeTask({ key: 'folder/note.md', name: 'upload' });
	const selection = createSelection([folder, file]);

	selection.toggle('folder', false);

	expect(selection.getState()).toStrictEqual({ deselected: [folder, file], selected: [] });
});

test('selecting descendant file task restores required ancestor create-folder tasks', () => {
	const selection = createSelection([
		makeTask({ key: 'folder', localIsDir: true, name: 'createLocalDir' }),
		makeTask({ key: 'folder/note.md', name: 'upload' }),
	]);

	selection.toggle('folder', false);
	selection.toggle('folder/note.md', true);

	expect(selection.isSelected('folder')).toBe(true);
	expect(selection.isSelected('folder/note.md')).toBe(true);
});
