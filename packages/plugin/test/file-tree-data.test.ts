import { expect, test } from 'bun:test';
import type { BaseTask, TaskNames } from '@/sync';
import createFileTreeData from '@/components/file-tree/tree-data';

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

test('compacts structural single-child folder chains into visible labels', () => {
	const data = createFileTreeData([
		makeTask({ key: 'docs/guides/getting-started.md', name: 'upload' }),
	]);

	expect(data.orderedNodeIds).toStrictEqual(['docs/guides/getting-started.md']);
	expect(data.nodes['docs/guides/getting-started.md']).toMatchObject({
		compressedLabel: 'docs / guides / getting-started.md',
		depth: 0,
	});
});

test('depths nested files by visible tree levels, not path segments', () => {
	const data = createFileTreeData([
		makeTask({
			key: 'test-files/Archive/2025/Work/Nested',
			name: 'removeRemote',
			remoteIsDir: true,
		}),
		makeTask({ key: 'test-files/Archive/2025/Work/Nested/a.md', name: 'upload' }),
	]);

	const nested = data.nodes['test-files/Archive/2025/Work/Nested'];
	const file = data.nodes['test-files/Archive/2025/Work/Nested/a.md'];
	expect(nested.depth).toBe(0);
	expect(file.depth).toBe(1);
});

test('orders siblings with folders first then alphabetically', () => {
	const data = createFileTreeData([
		makeTask({ key: 'notes.md', name: 'upload' }),
		makeTask({ key: 'zeta', localIsDir: true, name: 'createLocalDir' }),
		makeTask({ key: 'alpha', localIsDir: true, name: 'createLocalDir' }),
		makeTask({ key: 'archive.md', name: 'upload' }),
	]);

	expect(data.orderedNodeIds).toStrictEqual(['alpha', 'zeta', 'archive.md', 'notes.md']);
});
