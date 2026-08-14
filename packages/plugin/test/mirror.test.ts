import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import type { Decider } from '@/sync';
import { mirrorLocalDecider, mirrorRemoteDecider } from '@/sync';

const { file, fileRecord, findTask, folder, folderRecord, runDecider, taskNames } = testKit;

const strategies: Array<[string, Decider, 'local' | 'remote']> = [
	['mirror local', mirrorLocalDecider, 'local'],
	['mirror remote', mirrorRemoteDecider, 'remote'],
];

for (const [name, decider, source] of strategies) {
	const target = source === 'local' ? 'remote' : 'local';
	const sourceStats = (stat: ReturnType<typeof file> | ReturnType<typeof folder>) =>
		source === 'local'
			? { localStats: new Map([[stat.key, stat]]) }
			: { remoteStats: new Map([[stat.key, stat]]) };
	const targetStats = (stat: ReturnType<typeof file> | ReturnType<typeof folder>) =>
		source === 'local'
			? { remoteStats: new Map([[stat.key, stat]]) }
			: { localStats: new Map([[stat.key, stat]]) };

	test(`${name} copies an authoritative file`, () => {
		const stat = file('note.md', { uid: 'source' });
		const task = findTask(runDecider(decider, sourceStats(stat)), 'note.md');

		expect(task.name).toBe(source === 'local' ? 'upload' : 'download');
		expect(task[source]).toBe(stat);
	});

	test(`${name} removes a target-only file`, () => {
		const stat = file('note.md', { uid: 'target' });
		const task = findTask(runDecider(decider, targetStats(stat)), 'note.md');

		expect(task.name).toBe(source === 'local' ? 'removeRemote' : 'removeLocal');
		expect(task[target]).toBe(stat);
	});

	test(`${name} records a same-size unrecorded file`, () => {
		const sourceFile = file('note.md', { uid: 'source' });
		const targetFile = file('note.md', { uid: 'target' });
		const task = findTask(
			runDecider(decider, { ...sourceStats(sourceFile), ...targetStats(targetFile) }),
			'note.md',
		);

		expect(task.name).toBe('addRecord');
	});

	test(`${name} overwrites a differently sized unrecorded file`, () => {
		const sourceFile = file('note.md', { uid: 'source' });
		const targetFile = file('note.md', { size: 99, uid: 'target' });
		const task = findTask(
			runDecider(decider, { ...sourceStats(sourceFile), ...targetStats(targetFile) }),
			'note.md',
		);

		expect(task.name).toBe(source === 'local' ? 'upload' : 'download');
	});

	test(`${name} skips a recorded file that matches both sides`, () => {
		const local = file('note.md', { uid: 'local' });
		const remote = file('note.md', { uid: 'remote' });

		expect(
			runDecider(decider, {
				localStats: new Map([['note.md', local]]),
				records: new Map([['note.md', fileRecord('local', 'remote')]]),
				remoteStats: new Map([['note.md', remote]]),
			}),
		).toHaveLength(0);
	});

	test(`${name} replaces a target folder with an authoritative file`, () => {
		const sourceFile = file('entry', { uid: 'source' });
		const tasks = runDecider(decider, {
			...sourceStats(sourceFile),
			...targetStats(folder('entry')),
		});

		expect(taskNames(tasks)).toStrictEqual([
			source === 'local' ? 'removeRemote' : 'removeLocal',
			source === 'local' ? 'upload' : 'download',
		]);
	});

	test(`${name} creates an authoritative folder and clears stale records`, () => {
		const sourceFolder = folder('docs/');
		const tasks = runDecider(decider, {
			...sourceStats(sourceFolder),
			records: new Map([
				['docs/', folderRecord()],
				['gone.md', fileRecord('old-local', 'old-remote')],
			]),
		});

		expect(taskNames(tasks)).toStrictEqual([
			source === 'local' ? 'createRemoteDir' : 'createLocalDir',
			'removeRecord',
		]);
	});
}
