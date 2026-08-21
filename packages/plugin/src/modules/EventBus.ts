import type { Events } from '@';
import { apiVersion, Platform } from 'obsidian';
import { ref } from 'synthkernel';
import type { General } from '@/types';
import formatDateTime from '@/utils/format-date';
import { formatTime } from '@/utils/unit-converter';

// oxlint-disable-next-line sort-keys
const OS = {
	'Android Tablet': Platform.isTablet && Platform.isAndroidApp,
	iPadOS: Platform.isTablet && Platform.isMacOS,
	Android: Platform.isAndroidApp,
	iOS: Platform.isIosApp,
	Linux: Platform.isLinux,
	macOS: Platform.isMacOS,
	Windows: Platform.isWin,
};
const MAX_SYNC_LOGS = 100;
export const VERSION = Bun.env.VERSION ?? '3.0.0';

export type Dispatch<O extends object> = <K extends keyof O>(
	...[key, payload]: undefined extends O[K] ? [K] : [K, O[K]]
) => void;
export type On<O extends object> = <K extends keyof O>(
	key: K,
	callback: (payload: O[K]) => void,
) => () => void;
type SyncStats = {
	trigger: string;
	started: number;
	outcome?: 'noop' | 'completed' | 'cancelled' | 'failed';
	ended?: number;
	totalTasks?: number;
	succeededTasks?: number;
	failedTasks?: number;
	logs: Array<string>;
};

export default class EventBus {
	declare readonly events: {
		logSync: string;
		logGeneral: string;
		errorSync: string;
		errorGeneral: string;
	};
	private readonly cleanupCallbacks: Array<() => void> = [];
	private readonly isIdle = ref(true);
	private readonly syncLogs: Array<SyncStats> = [];
	private readonly generalLogs: Array<string> = [];

	constructor() {
		const { cleanupCallbacks, on, syncLogs, putSyncLog, putGeneralLog, getThisSync, isIdle } =
			this;
		cleanupCallbacks.push(
			on('syncStarted', ({ trigger }) => {
				isIdle(false);
				syncLogs.push({ logs: [], started: Date.now(), trigger });
				if (syncLogs.length > MAX_SYNC_LOGS) syncLogs.shift();
				putSyncLog(`Sync triggered by \`${trigger}\` started.`);
			}),
			on('logSync', (log) => putSyncLog(log)),
			on('errorSync', (log) => putSyncLog(log, 'error')),
			on('logGeneral', (log) => putGeneralLog(log)),
			on('errorGeneral', (log) => putGeneralLog(log, 'error')),
			on('executionStarted', (tasks) => {
				getThisSync().totalTasks = tasks.length;
				putSyncLog(`Execution of ${tasks.length} sync task(s) started.`);
			}),
			on('taskCompleted', ({ key, name }) => {
				const thisSync = getThisSync();
				if (thisSync.succeededTasks) thisSync.succeededTasks += 1;
				else thisSync.succeededTasks = 1;
				putSyncLog(`Task \`${name}\` of \`${key}\` succeeded.`);
			}),
			on('taskFailed', ({ key, name, error }) => {
				const thisSync = getThisSync();
				if (thisSync.failedTasks) thisSync.failedTasks += 1;
				else thisSync.failedTasks = 1;
				putSyncLog(
					`Task \`${name}\` of \`${key}\` failed with error: \`${error}\`.`,
					'error',
				);
			}),
			on('tasksConfirmed', (tasks) => putSyncLog(`Confirmed ${tasks.length} task(s).`)),
			on('syncCanceled', () => putSyncLog('Sync is forced to stop.')),
			on('deleteConfirmed', ({ reupload, delete: { length } }) =>
				putSyncLog(
					`Confirmed to delete ${length} files, reupload ${reupload.length} files.`,
				),
			),
			on('syncTerminated', (reason) => {
				const { result } = reason;
				const thisSync = getThisSync();
				thisSync.outcome = result;
				thisSync.ended = Date.now();
				if (result === 'failed')
					putSyncLog(`Sync ended with error: \`${reason.error}\`.`, 'error');
				else putSyncLog(`Sync ended with result: \`${result}\`.`);
				isIdle(true);
			}),
			on('moduleLoaded', (name) => putGeneralLog(`Module \`${name}\` loaded.`)),
			on('moduleUnloaded', (name) => putGeneralLog(`Module \`${name}\` unloaded.`)),
		);
	}

	private readonly getThisSync = () => this.syncLogs.at(-1) as SyncStats;
	private readonly putSyncLog = (log: string, level: 'info' | 'error' = 'info') => {
		const message = `- \`${level.toLocaleUpperCase()}\` - ${log}`;
		this.getThisSync().logs.push(message);
	};
	private readonly putGeneralLog = (log: string, level: 'info' | 'error' = 'info') => {
		const message = `- \`${level.toLocaleUpperCase()}\` - ${log}`;
		this.generalLogs.push(`- ${formatDateTime(Date.now(), true)} ${message}`);
	};

	private readonly subscribers: { [K in keyof Events]?: Set<(event: Events[K]) => void> } = {};

	private readonly on: On<Events> = <E extends keyof Events>(
		event: E,
		callback: (payload: Events[E]) => void,
	) => {
		this.subscribers[event] ??= new Set<(event: Events[E]) => void>() as never;
		this.subscribers[event].add(callback);
		return () => this.subscribers[event]?.delete(callback);
	};

	private readonly dispatch: Dispatch<Events> = <E extends keyof Events>(
		...[event, payload]: undefined extends Events[E] ? [E, Events[E]?] : [E, Events[E]]
	) => {
		this.subscribers[event]?.forEach((listener) => listener(payload as never));
	};

	private readonly getLogs = () => {
		const operatingSystem =
			Object.entries(OS).find(([, isActive]) => isActive)?.[0] ?? 'Unknown';
		const lines: Array<string> = [
			`Generated at: ${formatDateTime(Date.now())}`,
			`Plugin version: ${VERSION}`,
			`Obsidian API version: ${apiVersion}`,
			`Operating system: ${operatingSystem}`,
			'',
		];
		for (let i = this.syncLogs.length - 1; i >= 0; i--) {
			const {
				trigger,
				started,
				outcome,
				ended,
				totalTasks,
				succeededTasks,
				failedTasks,
				logs,
			} = this.syncLogs[i];
			lines.push(
				'---',
				'',
				`Trigger: \`${trigger}\``,
				`Started at: ${formatDateTime(started)}`,
			);
			if (ended)
				lines.push(
					`Ended at: ${formatDateTime(ended)}`,
					`Duration: ${formatTime(ended - started)}`,
				);
			if (totalTasks) lines.push(`Total tasks: ${totalTasks}`);
			if (succeededTasks) lines.push(`Succeed: ${succeededTasks}`);
			if (failedTasks) lines.push(`Failed: ${failedTasks}`);
			if (outcome) lines.push(`Outcome: \`${outcome}\``);
			lines.push('Logs:', '');
			for (const log of logs) lines.push(log);
			lines.push('');
		}
		if (this.generalLogs.length)
			lines.push('---', '', 'General logs:', '', ...this.generalLogs, '');
		return lines.join('\n');
	};

	readonly dispose = () => {
		this.cleanupCallbacks.forEach((cleanup) => cleanup());
		this.cleanupCallbacks.length = 0;
		if (!this.isIdle()) this.dispatch('syncCanceled');
	};

	readonly root = {
		dispatch: this.dispatch as Dispatch<General>,
		getLogs: this.getLogs,
		isIdle: this.isIdle,
		on: this.on as On<General>,
	};
}
