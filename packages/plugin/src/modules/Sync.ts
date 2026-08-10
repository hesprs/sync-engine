import type { Events, Translations } from '@';
import type { Ref } from 'synthkernel';
import { isSub } from '@repo/shared/path';
import { ref } from 'synthkernel';
import type { Fs } from '@/fs';
import type {
	BaseTask,
	ConflictResolver,
	Decider,
	TaskFactory,
	TaskNames,
	TaskOptionsMap,
} from '@/sync';
import type { GlobMatchRule, Progress, Stat, StatsMap, TogglableValue } from '@/types';
import type { GlobMatchResult } from '@/utils/glob-match';
import {
	RemoveLocal,
	CreateRemoteDir,
	Upload,
	AddRecord,
	RemoveRecord,
	detectMoves,
	syncCancelledError,
	taskMap,
} from '@/sync';
import { prepareGlobMatch } from '@/utils/glob-match';
import toErrorMessage from '@/utils/to-error-message';
import type { Dispatch, On } from './EventBus';
import type { Translate } from './I18n';
import type { DeleteConfirmReturn } from './ProgressModal';
import type { Infras, RemoteLister } from './Registrar';

export type SyncTerminateReason =
	| { result: 'cancelled' }
	| { result: 'completed' }
	| { result: 'failed'; error: string }
	| { result: 'noop' };

export type TaskInfo = { name: TaskNames; key: string; prettyName: string; isDir: boolean };
export type FailedTaskInfo = TaskInfo & { error: string };

export default class Sync {
	dispatch: Dispatch<Events>;
	on: On<Events>;

	constructor(
		private readonly ctx: {
			dispatch: Dispatch<Events>;
			initializeSync: () => Infras;
			getDecider: () => Decider;
			on: On<Events>;
			translate: Translate<Translations>;
			listRemote: RemoteLister;
			getConflictResolver: () => ConflictResolver;
		},
	) {
		this.dispatch = ctx.dispatch;
		this.on = ctx.on;
	}

	declare readonly events: {
		syncStarted: { isCancelled: Ref<boolean>; trigger: string };
		remoteWalkProgress: Progress;
		syncTerminated: SyncTerminateReason;
		requestConfirmDelete: Array<RemoveLocal>;
		requestConfirmTasks: Array<BaseTask>;
		syncCanceled: undefined;
		taskCompleted: TaskInfo;
		taskFailed: FailedTaskInfo;
		executionStarted: Array<BaseTask>;
	};
	declare readonly settings: {
		maxFileSize: TogglableValue;
		exclusionRules: Array<GlobMatchRule>;
		inclusionRules: Array<GlobMatchRule>;
		confirmDeleteInAutoSync: boolean;
		confirmTasksInSync: boolean;
	};

	private readonly postProcess = (
		stats: Array<Stat>,
		pruner: (stats: Array<Stat>) => Array<Stat>,
	) => {
		const statsMap = toMap(pruner(stats));
		const maxSize = this.settings.maxFileSize.enabled
			? this.settings.maxFileSize.value
			: Infinity;
		const includedStats: StatsMap = new Map();
		if (statsMap.size === 0) return includedStats;
		for (const [path, stat] of statsMap) {
			if (!stat.isDir && stat.size > maxSize) continue;
			includedStats.set(path, stat);
		}
		return includedStats;
	};

	private readonly confirmTasks = (tasks: Array<BaseTask>) =>
		new Promise<Array<BaseTask>>((resolve, reject) => {
			const unsub1 = this.on('tasksConfirmed', (result) => {
				cleanup();
				resolve(result);
			});
			const unsub2 = this.on('syncCanceled', () => {
				cleanup();
				reject(syncCancelledError);
			});
			function cleanup() {
				unsub1();
				unsub2();
			}
			this.dispatch('requestConfirmTasks', tasks);
		});

	private readonly confirmDeletion = (tasks: Array<RemoveLocal>) =>
		new Promise<DeleteConfirmReturn>((resolve, reject) => {
			const unsub1 = this.on('deleteConfirmed', (result) => {
				cleanup();
				resolve(result);
			});
			const unsub2 = this.on('syncCanceled', () => {
				cleanup();
				reject(syncCancelledError);
			});
			function cleanup() {
				unsub1();
				unsub2();
			}
			this.dispatch('requestConfirmDelete', tasks);
		});

	private readonly executeSync = async (trigger: string) => {
		const isCancelled = ref(false);
		let failedCount = 0;
		let tasks: Array<BaseTask>;
		let terminateReason!: SyncTerminateReason;
		const cleanup = this.on('syncCanceled', () => isCancelled(true));
		try {
			this.dispatch('syncStarted', { isCancelled, trigger });

			const infras = this.ctx.initializeSync();
			const { record, localFs } = infras;

			const match = prepareGlobMatch(
				this.settings.inclusionRules,
				this.settings.exclusionRules,
			);
			const { reporter: localReporter, pruner: localPruner } = prepareReporter(match);
			const { reporter: remoteReporter, pruner: remotePruner } = prepareReporter(match);

			const [localList, remoteList] = await Promise.all([
				localFs.list('/', localReporter),
				this.ctx.listRemote({
					...infras,
					reporter: (prog) => {
						this.dispatch('remoteWalkProgress', prog);
						return remoteReporter(prog);
					},
					trigger,
				}),
			]);
			if (isCancelled()) throw syncCancelledError;
			const records = new Map(await record.entries());
			const localStats = this.postProcess(localList, localPruner);
			const remoteStats = this.postProcess(remoteList, remotePruner);
			this.dispatch(
				'logSync',
				`Local ${localStats.size} item(s), remote ${remoteStats.size} item(s), record ${records.size} item(s).`,
			);

			if (isCancelled()) throw syncCancelledError;
			const taskFactory = createTaskFactory({
				baseOptions: infras,
				resolver: this.ctx.getConflictResolver(),
				translate: this.ctx.translate,
			});
			tasks = this.ctx.getDecider()({
				localStats,
				logger: (log: string) => this.dispatch('logSync', log),
				records,
				remoteStats,
				taskFactory,
			});
			if (tasks.length === 0) {
				terminateReason = { result: 'noop' };
				return terminateReason;
			}

			const initialTasks = tasks.length;
			tasks = detectMoves(tasks, this.ctx.translate, records);
			const convertedTasks = initialTasks - tasks.length;
			if (convertedTasks)
				this.dispatch(
					'logSync',
					`Discovered and converted ${convertedTasks} move task(s).`,
				);

			this.dispatch('logSync', `Planning finished with ${tasks.length} task(s).`);

			const [nonDisplayableTasks, displayableTasks] = partition(
				tasks,
				(task) => task instanceof AddRecord || task instanceof RemoveRecord,
			);
			if (
				trigger === 'manual' &&
				this.settings.confirmTasksInSync &&
				displayableTasks.length !== 0
			) {
				const confirmResult = await this.confirmTasks(displayableTasks);
				tasks = [...nonDisplayableTasks, ...confirmResult];
			}

			const [removeLocalTasks, otherTasks] = partition(
				tasks,
				(task) => task instanceof RemoveLocal,
			);
			if (
				(trigger === 'realtime' || trigger === 'startup' || trigger === 'scheduled') &&
				this.settings.confirmDeleteInAutoSync &&
				removeLocalTasks.length !== 0
			) {
				const { delete: deleted, reupload } = await this.confirmDeletion(removeLocalTasks);
				tasks = [
					...deleted,
					...(await this.convertDeleteToUpload(reupload, localFs)),
					...otherTasks,
				];
			}

			sortTasks(tasks);

			if (isCancelled()) throw syncCancelledError;
			this.dispatch('executionStarted', tasks);
			await Promise.all(
				tasks.map(async (task) => {
					try {
						await task.exec();
						this.dispatch('taskCompleted', toTaskInfo(task));
					} catch (error) {
						if (isCancelled()) return;
						failedCount++;
						this.dispatch('taskFailed', {
							...toTaskInfo(task),
							error: toErrorMessage(error),
						});
					}
				}),
			);

			terminateReason = isCancelled()
				? { result: 'cancelled' }
				: failedCount
					? {
							error: `Execution of ${failedCount} sync task(s) failed.`,
							result: 'failed',
						}
					: { result: 'completed' };
		} catch (error) {
			terminateReason = isCancelled()
				? { result: 'cancelled' }
				: ({ error: toErrorMessage(error), result: 'failed' } as const);
		} finally {
			cleanup();
			this.dispatch('syncTerminated', terminateReason);
		}
		return terminateReason;
	};

	private readonly convertDeleteToUpload = async (tasks: Array<RemoveLocal>, localFs: Fs) => {
		const final: Array<Upload | CreateRemoteDir> = [];
		await Promise.all(
			tasks.map(async (task) => {
				const options = task.options;
				const local = await localFs.stat(options.key);
				if (!local) {
					this.dispatch(
						'logSync',
						`Local file \`${options.key}\` not found during reupload.`,
					);
					return;
				}
				if (local.isDir) final.push(new CreateRemoteDir({ ...options, local }));
				else final.push(new Upload({ ...options, local }));
			}),
		);
		return final;
	};

	root = { executeSync: this.executeSync };
}

function toMap(stats: Array<Stat>): StatsMap {
	const res = new Map<string, Stat>();
	for (const stat of stats) res.set(stat.key, stat);
	return res;
}

function createTaskFactory({
	baseOptions,
	translate,
	resolver,
}: {
	baseOptions: Infras;
	translate: (name: TaskNames) => string;
	resolver: ConflictResolver;
}): TaskFactory {
	return (<N extends TaskNames>(name: N, options: TaskOptionsMap[N]) => {
		const task =
			name === 'resolveConflict'
				? new taskMap[name]({ ...options, ...baseOptions, resolver } as never)
				: new taskMap[name]({ ...options, ...baseOptions } as never);
		task.name = name;
		task.prettyName = translate(name);
		return task;
	}) as TaskFactory;
}

function partition<T, U extends T>(
	items: ReadonlyArray<T>,
	predicate: (item: T, index: number) => item is U,
): [Array<U>, Array<Exclude<T, U>>] {
	const truthy: Array<T> = [];
	const falsy: Array<T> = [];
	for (let i = 0; i < items.length; i++) (predicate(items[i], i) ? truthy : falsy).push(items[i]);
	return [truthy as Array<U>, falsy as Array<Exclude<T, U>>];
}

function toTaskInfo({ key, name, prettyName, local, remote }: BaseTask): TaskInfo {
	const isDir = local?.isDir ?? remote?.isDir ?? false;
	return { isDir, key, name, prettyName };
}

function sortTasks(tasks: Array<BaseTask>) {
	const region = (task: BaseTask) => {
		const isFolder = task.local?.isDir === true || task.remote?.isDir === true;
		if (task.name === 'removeLocal' || task.name === 'removeRemote') return isFolder ? 3 : 0;
		if (task.name === 'createLocalDir' || task.name === 'createRemoteDir') return 1;
		return task.name === 'moveLocal' || task.name === 'moveRemote' ? 2 : 4;
	};
	tasks.sort((a, b) => {
		const aRegion = region(a);
		const bRegion = region(b);
		if (aRegion !== bRegion) return aRegion - bRegion;
		if (aRegion === 3) return b.key.length - a.key.length;
		if (aRegion === 1 || aRegion === 2) return a.key.length - b.key.length;
		return 0;
	});
}

function prepareReporter(match: (path: string) => GlobMatchResult) {
	const probes: Array<string> = [];
	return {
		// Prune probe folders that need to be excluded
		pruner: (stats: Array<Stat>) => {
			const probeSet = new Set(probes);
			const content = stats.filter((p) => !probeSet.has(p.key));
			if (content.length === 0) return [];
			const keptProbes = new Set<string>();
			for (const probe of probeSet)
				if (content.some((p) => isSub(probe, p.key, false))) keptProbes.add(probe);
			return stats.filter((p) => !probeSet.has(p.key) || keptProbes.has(p.key));
		},
		reporter: (prog: Required<Progress>) => {
			const result = match(prog.current);
			if (result === 'probe') {
				probes.push(prog.current);
				return 'advance';
			}
			return result;
		},
	};
}
