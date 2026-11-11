import { executeTasks, getTaskRegion, getTaskTransferSize } from '@/sync';
import { REGRET_ERROR } from '@/utils/pipe';
import { expect, test } from 'bun:test';
import type { Task } from '@/sync';

function mockTask(
	name: Task['name'],
	key: string,
	options: { isDir?: boolean; size?: number; exec?: () => Promise<void> | void } = {},
): Task {
	const isDir = options.isDir ?? false;
	const size = options.size ?? 0;
	const stat = isDir
		? { isDir: true as const, key, meta: () => ({}) }
		: { isDir: false as const, key, meta: () => ({}), mtime: 0, size, uid: 'uid' };

	return {
		exec: options.exec ?? (() => Promise.resolve()),
		key,
		local: stat,
		localFs: {} as unknown as Task['localFs'],
		name,
		options: {} as unknown as Task['options'],
		record: {} as unknown as Task['record'],
		remote: stat,
		remoteFs: {} as unknown as Task['remoteFs'],
	} as unknown as Task;
}

test('getTaskRegion identifies regions correctly', () => {
	expect(getTaskRegion(mockTask('removeLocal', 'a.md'))).toBe(0);
	expect(getTaskRegion(mockTask('removeRemote', 'a.md'))).toBe(0);
	expect(getTaskRegion(mockTask('createLocalDir', 'a/', { isDir: true }))).toBe(1);
	expect(getTaskRegion(mockTask('createRemoteDir', 'a/', { isDir: true }))).toBe(1);
	expect(getTaskRegion(mockTask('moveLocal', 'a.md'))).toBe(2);
	expect(getTaskRegion(mockTask('moveRemote', 'a.md'))).toBe(2);
	expect(getTaskRegion(mockTask('removeLocal', 'a/', { isDir: true }))).toBe(3);
	expect(getTaskRegion(mockTask('removeRemote', 'a/', { isDir: true }))).toBe(3);
	expect(getTaskRegion(mockTask('upload', 'a.md'))).toBe(4);
	expect(getTaskRegion(mockTask('download', 'a.md'))).toBe(4);
	expect(getTaskRegion(mockTask('addRecord', 'a.md'))).toBe(4);
});

test('getTaskTransferSize returns sizes correctly', () => {
	expect(getTaskTransferSize(mockTask('upload', 'a.md', { size: 1024 }))).toBe(1024);
	expect(getTaskTransferSize(mockTask('download', 'a.md', { size: 2048 }))).toBe(2048);
	expect(getTaskTransferSize(mockTask('createRemoteDir', 'a/', { isDir: true }))).toBe(0);
	expect(getTaskTransferSize(mockTask('removeLocal', 'a.md', { size: 500 }))).toBe(0);
});

test('executeTasks respects phase order: Region 0 -> 1 -> 2 -> 3 -> 4', async () => {
	const order: Array<string> = [];
	const completed: Array<string> = [];

	const t0 = mockTask('removeLocal', 'old.md', {
		exec: () => {
			order.push('r0');
		},
	});
	const t1 = mockTask('createRemoteDir', 'folder/', {
		exec: () => {
			order.push('r1');
		},
		isDir: true,
	});
	const t2 = mockTask('moveRemote', 'renamed.md', {
		exec: () => {
			order.push('r2');
		},
	});
	const t3 = mockTask('removeRemote', 'old-folder/', {
		exec: () => {
			order.push('r3');
		},
		isDir: true,
	});
	const t4 = mockTask('upload', 'new.md', {
		exec: () => {
			order.push('r4');
		},
		size: 100,
	});

	const { failedCount } = await executeTasks([t4, t3, t2, t1, t0], {
		isCancelled: () => false,
		onTaskComplete: (t) => completed.push(t.key),
		onTaskFailed: () => {},
	});

	expect(failedCount).toBe(0);
	expect(order).toEqual(['r0', 'r1', 'r2', 'r3', 'r4']);
	expect(completed).toEqual(['old.md', 'folder/', 'renamed.md', 'old-folder/', 'new.md']);
});

test('executeTasks enforces sequential order for directory creations and deletions', async () => {
	const dirCreations: Array<string> = [];
	const dirDeletions: Array<string> = [];

	const tParentDir = mockTask('createRemoteDir', 'parent/', {
		exec: async () => {
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 10);
			});
			dirCreations.push('parent/');
		},
		isDir: true,
	});
	const tChildDir = mockTask('createRemoteDir', 'parent/child/', {
		exec: () => {
			dirCreations.push('parent/child/');
		},
		isDir: true,
	});

	const tChildDel = mockTask('removeRemote', 'parent/child/', {
		exec: async () => {
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 10);
			});
			dirDeletions.push('parent/child/');
		},
		isDir: true,
	});
	const tParentDel = mockTask('removeRemote', 'parent/', {
		exec: () => {
			dirDeletions.push('parent/');
		},
		isDir: true,
	});

	await executeTasks([tParentDir, tChildDir, tChildDel, tParentDel], {
		isCancelled: () => false,
		onTaskComplete: () => {},
		onTaskFailed: () => {},
	});

	expect(dirCreations).toEqual(['parent/', 'parent/child/']);
	expect(dirDeletions).toEqual(['parent/child/', 'parent/']);
});

test('executeTasks serializes heavy tasks to prevent memory explosion', async () => {
	let activeHeavyCount = 0;
	let maxConcurrentHeavy = 0;

	const createHeavy = (key: string) =>
		mockTask('upload', key, {
			exec: async () => {
				activeHeavyCount++;
				maxConcurrentHeavy = Math.max(maxConcurrentHeavy, activeHeavyCount);
				await new Promise<void>((resolve) => {
					setTimeout(resolve, 20);
				});
				activeHeavyCount--;
			},
			size: 10 * 1024 * 1024, // 10 MiB
		});

	const tasks = [createHeavy('1.pdf'), createHeavy('2.pdf'), createHeavy('3.pdf')];

	const { failedCount } = await executeTasks(tasks, {
		isCancelled: () => false,
		maxMemory: 12 * 1024 * 1024, // Budget 12 MiB -> only 1 heavy task (10 MiB) can fit at a time!
		onTaskComplete: () => {},
		onTaskFailed: () => {},
	});

	expect(failedCount).toBe(0);
	expect(maxConcurrentHeavy).toBe(1);
});

test('executeTasks enables fast-lane for small files even when budget is occupied', async () => {
	let heavyActive = false;
	const smallCompletedWhileHeavyRunning: Array<string> = [];

	const heavy = mockTask('upload', 'huge.iso', {
		exec: async () => {
			heavyActive = true;
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 50);
			});
			heavyActive = false;
		},
		size: 20 * 1024 * 1024, // 20 MiB
	});

	const small1 = mockTask('upload', 'quick1.md', {
		exec: () => {
			if (heavyActive) smallCompletedWhileHeavyRunning.push('quick1.md');
		},
		size: 1024, // 1 KiB
	});

	const small2 = mockTask('upload', 'quick2.md', {
		exec: () => {
			if (heavyActive) smallCompletedWhileHeavyRunning.push('quick2.md');
		},
		size: 2048, // 2 KiB
	});

	await executeTasks([heavy, small1, small2], {
		isCancelled: () => false,
		maxFastLane: 2,
		maxMemory: 16 * 1024 * 1024, // 16 MiB budget, occupied by 20 MiB heavy task
		onTaskComplete: () => {},
		onTaskFailed: () => {},
	});

	expect(smallCompletedWhileHeavyRunning.length).toBe(2);
});

test('executeTasks handles failed tasks and regret errors gracefully', async () => {
	const failedKeys: Array<string> = [];
	const completedKeys: Array<string> = [];

	const tFail = mockTask('upload', 'fail.md', {
		exec: () => {
			throw new Error('Network error');
		},
		size: 100,
	});

	const tRegret = mockTask('upload', 'regret.md', {
		exec: () => {
			throw REGRET_ERROR;
		},
		size: 100,
	});

	const tSuccess = mockTask('upload', 'ok.md', { exec: () => {}, size: 100 });

	const { failedCount } = await executeTasks([tFail, tRegret, tSuccess], {
		isCancelled: () => false,
		onTaskComplete: (t) => completedKeys.push(t.key),
		onTaskFailed: (t) => failedKeys.push(t.key),
	});

	expect(failedCount).toBe(1);
	expect(failedKeys).toEqual(['fail.md']);
	expect(completedKeys).toEqual(['regret.md', 'ok.md']);
});

test('executeTasks stops scheduling when cancelled', async () => {
	let cancelled = false;
	const executed: Array<string> = [];

	const t1 = mockTask('upload', '1.md', {
		exec: () => {
			executed.push('1.md');
			cancelled = true; // Trigger cancel during first task
		},
		size: 100,
	});

	const t2 = mockTask('upload', '2.md', {
		exec: () => {
			executed.push('2.md');
		},
		size: 100,
	});

	await executeTasks([t1, t2], {
		isCancelled: () => cancelled,
		maxConcurrency: 1,
		onTaskComplete: () => {},
		onTaskFailed: () => {},
	});

	expect(executed).toEqual(['1.md']);
});
