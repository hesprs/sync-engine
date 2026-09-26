import type { Events, Translations } from '@';
import type { Ref } from 'synthkernel';
import { toError } from '@repo/shared/error';
import { isSub } from '@repo/shared/path';
import { ref } from 'synthkernel';
import type { Fs, ListOptions, ListReporter } from '@/fs';
import type { BaseTask, ConflictResolver, TaskFactory, TaskNames, TaskOptionsMap } from '@/sync';
import type {
	GlobStrategy,
	MaybePromise,
	Progress,
	RecordStat,
	RecordStatsMap,
	Stat,
	StatsMap,
	TogglableValue,
} from '@/types';
import type { GlobMatchResult } from '@/utils/glob-match';
import {
	RemoveLocal,
	CreateRemoteDir,
	Upload,
	AddRecord,
	RemoveRecord,
	convertMoves,
	syncCancelledError,
	taskMap,
} from '@/sync';
import { NONE_STRATEGY, prepareGlobMatch } from '@/utils/glob-match';
import type { Dispatch, On } from './EventBus';
import type { Translate } from './I18n';
import type { DeleteConfirmReturn } from './ProgressModal';
import type { DecideTasksInput, Infras } from './Registrar';

export type SyncTerminateReason =
	| { result: 'cancelled' }
	| { result: 'completed' }
	| { result: 'failed'; error: Error }
	| { result: 'noop' };

export type TaskInfo = { name: TaskNames; key: string; prettyName: string; isDir: boolean };
export type FailedTaskInfo = TaskInfo & { error: Error };
export type RemoteLister = (info: Infras & { reporter: ListReporter }) => MaybePromise<Array<Stat>>;
export type SyncOptions = {
	remoteLister?: RemoteLister;
	conflictResolver?: ConflictResolver;
	detectMoves?: boolean;
	needConfirmTasks?: boolean;
	needConfirmDeletion?: boolean;
	syncStrategy?: Array<GlobStrategy>;
};

export default class Sync {
	constructor(
		private readonly ctx: {
			dispatch: Dispatch<Events>;
			initializeSync: () => Infras;
			on: On<Events>;
			translate: Translate<Translations>;
			getConflictResolver: () => ConflictResolver;
			decideTasks: (input: DecideTasksInput) => Array<BaseTask>;
		},
	) {}

	declare readonly events: {
		syncStarted: { isCancelled: Ref<boolean>; trigger: string };
		syncInitialized: Infras & { match: (path: string) => GlobMatchResult };
		remoteWalkProgress: Progress;
		syncTerminated: SyncTerminateReason;
		requestConfirmDelete: Array<RemoveLocal>;
		requestConfirmTasks: Array<BaseTask>;
		syncCanceled: undefined;
		taskCompleted: TaskInfo;
		taskFailed: FailedTaskInfo;
		executionStarted: Array<BaseTask>;
	};
	declare readonly settings: { maxFileSize: TogglableValue; syncStrategy: Array<GlobStrategy> };

	private readonly postProcess = (
		stats: Array<Stat>,
		organizer: (stats: Array<Stat>) => Record<string, StatsMap>,
	) => {
		const { enabled, value } = this.settings.maxFileSize;
		const maxSize = enabled ? value : Infinity;
		return organizer(stats.filter((stat) => stat.isDir || stat.size <= maxSize));
	};

	private readonly confirmTasks = (tasks: Array<BaseTask>) =>
		new Promise<Array<BaseTask>>((resolve, reject) => {
			const { on, dispatch } = this.ctx;
			const unsub1 = on('tasksConfirmed', (result) => {
				cleanup();
				resolve(result);
			});
			const unsub2 = on('syncCanceled', () => {
				cleanup();
				reject(syncCancelledError);
			});
			function cleanup() {
				unsub1();
				unsub2();
			}
			dispatch('requestConfirmTasks', tasks);
		});

	private readonly confirmDeletion = (tasks: Array<RemoveLocal>) =>
		new Promise<DeleteConfirmReturn>((resolve, reject) => {
			const { on, dispatch } = this.ctx;
			const unsub1 = on('deleteConfirmed', (result) => {
				cleanup();
				resolve(result);
			});
			const unsub2 = on('syncCanceled', () => {
				cleanup();
				reject(syncCancelledError);
			});
			function cleanup() {
				unsub1();
				unsub2();
			}
			dispatch('requestConfirmDelete', tasks);
		});

	private readonly executeSync = async (
		trigger: string,
		options: SyncOptions = {},
	): Promise<SyncTerminateReason> => {
		const { settings, ctx, postProcess, confirmDeletion, confirmTasks, convertDeleteToUpload } =
			this;
		const { on, dispatch, initializeSync, getConflictResolver, translate, decideTasks } = ctx;
		const {
			remoteLister = async ({ remoteFs, record, reporter }) => {
				try {
					return await remoteFs.list('/', reporter);
				} catch (error) {
					if (await remoteFs.exists('/')) throw error;
					dispatch('logSync', 'Remote root deleted, recreating.');
					await Promise.all([remoteFs.mkdir('/', true), record.clear()]);
					return [];
				}
			},
			conflictResolver = getConflictResolver(),
			detectMoves = true,
			needConfirmDeletion = false,
			needConfirmTasks = false,
			syncStrategy = settings.syncStrategy,
		} = options;

		const isCancelled = ref(false);
		let failedCount = 0;
		let tasks: Array<BaseTask>;
		let terminateReason!: SyncTerminateReason;
		const cleanup = on('syncCanceled', () => isCancelled(true));
		try {
			dispatch('syncStarted', { isCancelled, trigger });
			if (isCancelled()) throw syncCancelledError;

			const infras = initializeSync();
			const { record: recordStore, localFs } = infras;
			const match = prepareGlobMatch(syncStrategy);
			const { reporter: localReporter, organizer: localOrganizer } = prepareList(match);
			const { reporter: remoteReporter, organizer: remoteOrganizer } = prepareList(match);
			dispatch('syncInitialized', { ...infras, match });
			const [localList, remoteList, recordList] = await Promise.all([
				localFs.list('/', localReporter),
				remoteLister({
					...infras,
					reporter: (prog) => {
						dispatch('remoteWalkProgress', prog);
						return remoteReporter(prog);
					},
				}),
				recordStore.entries(),
			]);
			if (isCancelled()) throw syncCancelledError;
			const record = organizeRecord(recordList, match);
			const local = postProcess(localList, localOrganizer);
			const remote = postProcess(remoteList, remoteOrganizer);
			if (isCancelled()) throw syncCancelledError;

			const taskFactory = createTaskFactory({
				baseOptions: infras,
				resolver: conflictResolver,
				translate,
			});
			tasks = decideTasks({ local, record, remote, taskFactory });
			if (tasks.length === 0) {
				terminateReason = { result: 'noop' };
				return terminateReason;
			}

			if (detectMoves) {
				const initialTasks = tasks.length;
				tasks = convertMoves(tasks, translate, new Map(recordList));
				const convertedTasks = initialTasks - tasks.length;
				if (convertedTasks)
					dispatch('logSync', `Discovered and converted ${convertedTasks} move task(s).`);
			}

			dispatch('logSync', `Planning finished with ${tasks.length} task(s).`);

			const [nonDisplayableTasks, displayableTasks] = partition(
				tasks,
				(task) => task instanceof AddRecord || task instanceof RemoveRecord,
			);
			if (needConfirmTasks && displayableTasks.length !== 0) {
				const confirmResult = await confirmTasks(displayableTasks);
				tasks = [...nonDisplayableTasks, ...confirmResult];
			}

			const [removeLocalTasks, otherTasks] = partition(
				tasks,
				(task) => task instanceof RemoveLocal,
			);
			if (needConfirmDeletion && removeLocalTasks.length !== 0) {
				const { delete: deleted, reupload } = await confirmDeletion(removeLocalTasks);
				tasks = [
					...deleted,
					...(await convertDeleteToUpload(reupload, localFs)),
					...otherTasks,
				];
			}

			sortTasks(tasks);

			if (isCancelled()) throw syncCancelledError;
			dispatch('executionStarted', tasks);
			const errors: Array<FailedTaskInfo> = [];
			await Promise.all(
				tasks.map(async (task) => {
					try {
						await task.exec();
						dispatch('taskCompleted', toTaskInfo(task));
					} catch (error) {
						if (isCancelled()) return;
						failedCount++;
						const info = { ...toTaskInfo(task), error: toError(error) };
						errors.push(info);
						dispatch('taskFailed', info);
					}
				}),
			);

			terminateReason = isCancelled()
				? { result: 'cancelled' }
				: failedCount
					? {
							error: new Error(`Execution of ${failedCount} sync task(s) failed.`, {
								cause: errors,
							}),
							result: 'failed',
						}
					: { result: 'completed' };
		} catch (error) {
			terminateReason = isCancelled()
				? { result: 'cancelled' }
				: ({ error: toError(error), result: 'failed' } as const);
		} finally {
			cleanup();
			dispatch('syncTerminated', terminateReason);
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
					this.ctx.dispatch(
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

function prepareList(match: (path: string) => GlobMatchResult) {
	const probes = new Set<string>();
	const strategies = new Map<string, string>();
	return {
		// Prune probe folders that need to be excluded and organize stats into strategies
		organizer: (stats: Array<Stat>) => {
			const content = stats.filter(({ key }) => !probes.has(key));
			if (content.length === 0) return {};
			const keptProbes = new Set<string>();
			for (const probe of probes)
				if (content.some(({ key }) => isSub(probe, key, false))) keptProbes.add(probe);
			const pruned = stats.filter(({ key }) => !probes.has(key) || keptProbes.has(key));
			const result: Record<string, StatsMap> = {};
			for (const stat of pruned) {
				const { key } = stat;
				const strategy = strategies.get(key);
				if (!strategy) continue;
				result[strategy] ??= new Map<string, Stat>();
				result[strategy].set(key, stat);
			}
			return result;
		},
		reporter: ({ current }: { current: string }): ListOptions => {
			const { advance, strategy } = match(current);
			if (strategy !== NONE_STRATEGY) strategies.set(current, strategy);
			if (advance) {
				if (strategy === NONE_STRATEGY) probes.add(current);
				return 'advance';
			}
			if (strategy === NONE_STRATEGY) return 'exclude';
			return 'include';
		},
	};
}

function organizeRecord(
	records: Array<[string, RecordStat]>,
	match: (path: string) => GlobMatchResult,
) {
	const result: Record<string, RecordStatsMap> = {};
	for (const [key, stat] of records) {
		const { strategy } = match(key);
		if (strategy === NONE_STRATEGY) continue;
		result[strategy] ??= new Map<string, RecordStat>();
		result[strategy].set(strategy, stat);
	}
	return result;
}
