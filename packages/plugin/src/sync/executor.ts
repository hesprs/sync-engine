import { REGRET_ERROR_MESSAGE } from '@/utils/pipe';
import { toError } from '@repo/shared/error';
import { Platform } from 'obsidian';
import type { Task } from './tasks/interface';

export const FAST_LANE_THRESHOLD = 64 * 1024; // 64 KiB

export function getTaskRegion(task: Task): number {
	const isFolder = task.local?.isDir === true || task.remote?.isDir === true;
	if (task.name === 'removeLocal' || task.name === 'removeRemote') return isFolder ? 3 : 0;
	if (task.name === 'createLocalDir' || task.name === 'createRemoteDir') return 1;
	return task.name === 'moveLocal' || task.name === 'moveRemote' ? 2 : 4;
}

export function getTaskTransferSize(task: Task): number {
	if (task.name === 'upload') return task.local?.isDir ? 0 : (task.local?.size ?? 0);
	if (task.name === 'download') return task.remote?.isDir ? 0 : (task.remote?.size ?? 0);
	if (task.name === 'resolveConflict') {
		const localSize = task.local?.isDir ? 0 : (task.local?.size ?? 0);
		const remoteSize = task.remote?.isDir ? 0 : (task.remote?.size ?? 0);
		return Math.max(localSize, remoteSize);
	}
	return 0;
}

export function getDefaultMaxMemory(): number {
	if (Platform.isMobile) {
		const nav = typeof navigator === 'undefined' ? undefined : navigator;
		const lowMem =
			(nav &&
				'deviceMemory' in nav &&
				typeof nav.deviceMemory === 'number' &&
				nav.deviceMemory <= 4) ||
			(nav && typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4);
		return lowMem ? 8 * 1024 * 1024 : 16 * 1024 * 1024;
	}
	return 64 * 1024 * 1024;
}

export type TaskExecutorOptions = {
	isCancelled: () => boolean;
	onTaskComplete: (task: Task) => void;
	onTaskFailed: (task: Task, error: Error) => void;
	maxMemory?: number;
	maxConcurrency?: number;
	maxFastLane?: number;
};

async function runTaskBatch(
	batch: Array<Task>,
	concurrency: number,
	runTask: (task: Task) => Promise<void>,
	isCancelled: () => boolean,
): Promise<void> {
	if (batch.length === 0 || isCancelled()) return;
	let index = 0;
	const workers = Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
		while (index < batch.length && !isCancelled()) {
			const task = batch[index++];
			await runTask(task);
		}
	});
	await Promise.all(workers);
}

async function runTransferTasks(
	tasks: Array<Task>,
	options: TaskExecutorOptions,
	runTask: (task: Task) => Promise<void>,
): Promise<void> {
	if (tasks.length === 0 || options.isCancelled()) return;

	const maxMemory = options.maxMemory ?? getDefaultMaxMemory();
	const maxConcurrency = options.maxConcurrency ?? (Platform.isMobile ? 6 : 12);
	const maxFastLane = options.maxFastLane ?? (Platform.isMobile ? 2 : 4);

	const fastQueue: Array<Task> = [];
	const heavyQueue: Array<Task> = [];

	for (const task of tasks) {
		const size = getTaskTransferSize(task);
		if (size <= FAST_LANE_THRESHOLD) fastQueue.push(task);
		else heavyQueue.push(task);
	}

	let inFlightBytes = 0;
	let activeCount = 0;
	let activeFastLaneCount = 0;

	return new Promise<void>((resolve) => {
		let isSettled = false;

		const checkFinished = () => {
			if (isSettled) return;
			if (options.isCancelled() && activeCount === 0) {
				isSettled = true;
				resolve();
				return;
			}
			if (fastQueue.length === 0 && heavyQueue.length === 0 && activeCount === 0) {
				isSettled = true;
				resolve();
			}
		};

		const schedule = () => {
			if (isSettled) return;
			if (options.isCancelled()) {
				checkFinished();
				return;
			}

			while (!options.isCancelled() && activeCount < maxConcurrency) {
				// Try scheduling a heavy task first if memory allows
				if (heavyQueue.length > 0) {
					const nextHeavy = heavyQueue[0];
					const heavySize = getTaskTransferSize(nextHeavy);
					const canStartHeavy =
						inFlightBytes === 0 ||
						inFlightBytes + heavySize <= maxMemory ||
						(inFlightBytes <= FAST_LANE_THRESHOLD * maxFastLane &&
							activeCount === activeFastLaneCount);

					if (canStartHeavy) {
						heavyQueue.shift();
						startTask(nextHeavy, heavySize);
						continue;
					}
				}

				// Try scheduling a fast-lane task
				if (fastQueue.length > 0) {
					const nextFast = fastQueue[0];
					const fastSize = getTaskTransferSize(nextFast);
					const canStartFast =
						inFlightBytes + fastSize <= maxMemory || activeFastLaneCount < maxFastLane;

					if (canStartFast) {
						fastQueue.shift();
						startTask(nextFast, fastSize);
						continue;
					}
				}

				break;
			}

			checkFinished();
		};

		const startTask = (task: Task, size: number) => {
			activeCount++;
			inFlightBytes += size;
			const isFast = size <= FAST_LANE_THRESHOLD;
			if (isFast) activeFastLaneCount++;

			void (async () => {
				try {
					await runTask(task);
				} finally {
					activeCount--;
					inFlightBytes = Math.max(0, inFlightBytes - size);
					if (isFast) activeFastLaneCount = Math.max(0, activeFastLaneCount - 1);
					schedule();
				}
			})();
		};

		schedule();
	});
}

export async function executeTasks(
	tasks: Array<Task>,
	options: TaskExecutorOptions,
): Promise<{ failedCount: number }> {
	let failedCount = 0;
	const { isCancelled, onTaskComplete, onTaskFailed } = options;

	const runTask = async (task: Task) => {
		if (isCancelled()) return;
		const complete = () => onTaskComplete(task);
		try {
			await task.exec();
			complete();
		} catch (error) {
			if (isCancelled()) return;
			const err = toError(error);
			if (err.message === REGRET_ERROR_MESSAGE) {
				complete();
				return;
			}
			failedCount++;
			onTaskFailed(task, err);
		}
	};

	const region0Tasks: Array<Task> = []; // File removals
	const region1Tasks: Array<Task> = []; // Dir creations (short to long)
	const region2Tasks: Array<Task> = []; // Moves (short to long)
	const region3Tasks: Array<Task> = []; // Dir removals (long to short)
	const region4Tasks: Array<Task> = []; // Transfers & records

	for (const task of tasks) {
		const r = getTaskRegion(task);
		if (r === 0) region0Tasks.push(task);
		else if (r === 1) region1Tasks.push(task);
		else if (r === 2) region2Tasks.push(task);
		else if (r === 3) region3Tasks.push(task);
		else region4Tasks.push(task);
	}

	// Phase 1: Structural & Metadata Operations
	// 1.1 Remove files (bounded concurrency)
	await runTaskBatch(region0Tasks, Platform.isMobile ? 4 : 8, runTask, isCancelled);
	if (isCancelled()) return { failedCount };

	// 1.2 Create directories (sequential to guarantee parent before child)
	await runTaskBatch(region1Tasks, 1, runTask, isCancelled);
	if (isCancelled()) return { failedCount };

	// 1.3 Moves (sequential)
	await runTaskBatch(region2Tasks, 1, runTask, isCancelled);
	if (isCancelled()) return { failedCount };

	// 1.4 Remove empty directories (sequential to guarantee child before parent)
	await runTaskBatch(region3Tasks, 1, runTask, isCancelled);
	if (isCancelled()) return { failedCount };

	// Phase 2: Data Transfers & Records (Weighted Byte-Budget & Fast-Lane Pool)
	await runTransferTasks(region4Tasks, options, runTask);

	return { failedCount };
}
