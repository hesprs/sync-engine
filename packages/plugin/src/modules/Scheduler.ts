import type { Events } from '@';
import type { App, EventRef, TAbstractFile } from 'obsidian';
import type { Ref } from 'synthkernel';
import type { GlobStrategy, TogglableValue } from '@/types';
import { NONE_STRATEGY, prepareGlobMatch } from '@/utils/glob-match';
import untilTrue from '@/utils/until-true';
import type { Dispatch } from './EventBus';
import type { SyncStage } from './Observability';
import type { SyncOptions, SyncTerminateReason } from './Sync';

type SyncRequest = {
	trigger: string;
	resolve: (result: SyncTerminateReason) => void;
};

const OFFLINE_ERROR = new Error('Device is offline.');

export default class Scheduler {
	private readonly pendingRequests: Array<SyncRequest> = [];
	private isScheduling = false;
	private realtimeSyncTimer?: number;
	private scheduledSyncTimer?: number;
	private startupSyncTimer?: number;

	constructor(
		private readonly ctx: {
			syncStage: Ref<SyncStage>;
			executeSync: (trigger: string, options?: SyncOptions) => Promise<SyncTerminateReason>;
			registerEvent: (ref: EventRef) => void;
			reduceTriggers: (triggers: Array<string>) => { trigger: string; options?: SyncOptions };
			app: App;
			isIdle: Ref<boolean>;
			dispatch: Dispatch<Events>;
		},
	) {}

	declare settings: {
		startupSync: TogglableValue;
		scheduledSync: TogglableValue;
		realtimeSync: TogglableValue;
		syncStrategy: Array<GlobStrategy>;
		avoidAutoSyncWhenOffline: boolean;
	};

	private readonly requestSync = (trigger: string): Promise<SyncTerminateReason> => {
		if (
			!navigator.onLine &&
			this.settings.avoidAutoSyncWhenOffline &&
			trigger !== 'manual' &&
			trigger !== 'nonInteractiveManual'
		) {
			this.ctx.dispatch(
				'logGeneral',
				`Skipped offline auto sync with trigger \`${trigger}\`.`,
			);
			return Promise.resolve({ error: OFFLINE_ERROR, result: 'failed' });
		}
		return new Promise((resolve) => {
			this.pendingRequests.push({ resolve, trigger });
			void this.scheduleFlush();
		});
	};

	start = () => {
		const { workspace, vault } = this.ctx.app;
		workspace.onLayoutReady(() => {
			this.ctx.registerEvent(vault.on('create', this.onChange));
			this.ctx.registerEvent(vault.on('delete', this.onChange));
			this.ctx.registerEvent(vault.on('modify', this.onChange));
			this.ctx.registerEvent(vault.on('rename', this.onChange));
		});
		const { scheduledSync, startupSync } = this.settings;
		const schedule = () => {
			if (scheduledSync.enabled) this.startScheduledSync();
		};
		if (startupSync.enabled)
			this.startupSyncTimer = window.setTimeout(() => {
				void this.requestSync('startup').finally(schedule);
			}, startupSync.value);
		else schedule();
	};

	dispose = () => {
		while (this.pendingRequests.length > 0) {
			const request = this.pendingRequests.shift();
			request?.resolve({ result: 'cancelled' });
		}
		if (this.realtimeSyncTimer) {
			window.clearTimeout(this.realtimeSyncTimer);
			this.realtimeSyncTimer = undefined;
		}
		if (this.startupSyncTimer) {
			window.clearTimeout(this.startupSyncTimer);
			this.startupSyncTimer = undefined;
		}
		this.stopScheduledSync();
	};

	private readonly startScheduledSync = () => {
		if (this.scheduledSyncTimer) window.clearInterval(this.scheduledSyncTimer);
		this.scheduledSyncTimer = window.setInterval(
			() => void this.requestSync('interval'),
			this.settings.scheduledSync.value,
		);
	};

	private readonly stopScheduledSync = () => {
		if (this.scheduledSyncTimer) {
			window.clearInterval(this.scheduledSyncTimer);
			this.scheduledSyncTimer = undefined;
		}
	};

	private readonly onChange = ({ path }: TAbstractFile, old?: string) => {
		if (this.ctx.syncStage() === 'executing') return;
		const { realtimeSync, syncStrategy } = this.settings;
		if (!realtimeSync.enabled) return;

		const match = prepareGlobMatch(syncStrategy);
		if (
			match(path).strategy === NONE_STRATEGY &&
			!(old && match(old).strategy !== NONE_STRATEGY)
		)
			return;

		if (this.realtimeSyncTimer) window.clearTimeout(this.realtimeSyncTimer);
		this.realtimeSyncTimer = window.setTimeout(
			() => void this.requestSync('realtime'),
			realtimeSync.value,
		);
	};

	private readonly scheduleFlush = async () => {
		if (this.pendingRequests.length === 0 || this.isScheduling) return;
		this.isScheduling = true;
		await untilTrue(this.ctx.isIdle, 'stop');
		this.ctx.isIdle(false);
		void this.flush();
		this.isScheduling = false;
	};

	private readonly flush = async () => {
		const { executeSync, reduceTriggers } = this.ctx;
		const batch = this.pendingRequests.splice(0);
		const triggers = batch.map(({ trigger }) => trigger);
		const { trigger, options } = reduceTriggers(triggers);
		const result = await executeSync(trigger, options);
		for (const request of batch) request.resolve(result);
	};

	root = {
		requestSync: this.requestSync,
		startScheduledSync: this.startScheduledSync,
		stopScheduledSync: this.stopScheduledSync,
	};
}
