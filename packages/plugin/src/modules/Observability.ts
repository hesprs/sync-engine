import type { Events, Translations } from '@';
import type { App, Command, DataAdapter, IconName } from 'obsidian';
import type { Ref } from 'synthkernel';
import { Notice, Platform, setIcon } from 'obsidian';
import { computed, ref } from 'synthkernel';
import type { Progress } from '@/types';
import roundPercent from '@/utils/round-percent';
import toErrorMessage from '@/utils/to-error-message';
import { formatTime } from '@/utils/unit-converter';
import type { Dispatch, On } from './EventBus';
import type { Translate } from './I18n';
import type { SyncTerminateReason, TaskInfo } from './Sync';

export type SyncStage =
	| 'none'
	| 'walkingRemote'
	| 'awaitingConfirmation'
	| 'executing'
	| 'completed'
	| 'completedNoop'
	| 'cancelled'
	| 'failed';

const MOBILE_SYNC_NOTICE_HIDE_DELAY = 2000;

export type AddRibbonIcon = (
	icon: IconName,
	title: string,
	callback: (evt: MouseEvent) => void,
) => HTMLElement;

export default class Observability {
	private lastSyncTime = 0;
	private readonly sinceLastSyncText = ref('');
	private readonly syncStage = ref<SyncStage>('none');
	private readonly walkProgress = ref<Progress>({ completed: 0, total: 1 });
	private readonly executionProgress = ref<Progress<TaskInfo>>({ completed: 0, total: 0 });
	private readonly cleanupCallbacks: Array<() => void> = [];
	private readonly t: Translate<Translations>;
	private readonly progressText = computed(
		() => {
			const stage = this.syncStage();
			if (stage === 'walkingRemote') {
				const { completed, total } = this.walkProgress();
				return `${this.t('walkingRemote')} ${completed}/${total}`;
			} else if (stage === 'awaitingConfirmation') return this.t('awaitingConfirmation');
			else if (stage === 'executing') {
				const { completed, total } = this.executionProgress();
				return `${this.t('executing')} ${roundPercent(completed, total)}%`;
			} else if (stage === 'cancelled') return this.t('cancelled');
			else if (stage === 'completed')
				return `${this.t('completed')}${this.sinceLastSyncText()}`;
			else if (stage === 'completedNoop')
				return `${this.t('completedNoop')}${this.sinceLastSyncText()}`;
			else if (stage === 'failed') return this.t('failed');
			return '';
		},
		{
			deps: [
				this.syncStage,
				this.walkProgress,
				this.executionProgress,
				this.sinceLastSyncText,
			],
		},
	);

	declare readonly settings: { noticeStatusOnMobile: boolean; exportLogsDirectory: string };
	declare readonly i18n: {
		startSync: string;
		startNonInteractiveSync: string;
		stopSync: string;
		showProgress: string;
		exportLogsToFile: string;
		exportLogsFailed: string;
		idle: string;
	};

	constructor(
		private readonly ctx: {
			addStatusBarItem: () => HTMLElement;
			on: On<Events>;
			translate: Translate<Translations>;
			isIdle: Ref<boolean>;
			dispatch: Dispatch<Events>;
			requestSync: (trigger: string) => Promise<SyncTerminateReason>;
			showProgress: () => void;
			addCommand: (command: Command) => Command;
			addRibbonIcon: AddRibbonIcon;
			getLogs: () => string;
			app: App;
		},
	) {
		this.t = ctx.translate;
	}

	readonly start = () => {
		const {
			ctx,
			t,
			setupCommands,
			syncStage,
			cleanupCallbacks,
			sinceLastSyncText,
			settings,
			progressText,
			walkProgress,
			executionProgress,
			setupStatus,
		} = this;
		const { requestSync, dispatch, isIdle, addRibbonIcon, on } = ctx;
		let totalSyncTasks = 0;
		let completedTasks = 0;
		let updateInterval: number | undefined;
		let noticeTimeout: number | undefined;
		let mobileSyncNotice: Notice | undefined;

		setupCommands();
		setupStatus();

		cleanupCallbacks.push(
			on('syncStarted', () => {
				syncStage('walkingRemote');
				window.clearInterval(updateInterval);
				sinceLastSyncText('');
				if (settings.noticeStatusOnMobile && Platform.isMobile) {
					window.clearTimeout(noticeTimeout);
					mobileSyncNotice ??= new Notice(progressText(), 0);
				}
			}),
			on('requestConfirmDelete', () => syncStage('awaitingConfirmation')),
			on('requestConfirmTasks', () => syncStage('awaitingConfirmation')),
			on('executionStarted', (tasks) => {
				totalSyncTasks = tasks.length;
				completedTasks = 0;
				syncStage('executing');
			}),
			on('remoteWalkProgress', (progress) => walkProgress(progress)),
			on('taskCompleted', (current) => {
				completedTasks += 1;
				executionProgress({
					completed: completedTasks,
					current,
					total: totalSyncTasks,
				});
			}),
			on('syncTerminated', (reason) => {
				const { result } = reason;
				if (mobileSyncNotice)
					if (result === 'failed') {
						mobileSyncNotice.hide();
						mobileSyncNotice = undefined;
					} else
						noticeTimeout = window.setTimeout(() => {
							mobileSyncNotice?.hide();
							mobileSyncNotice = undefined;
						}, MOBILE_SYNC_NOTICE_HIDE_DELAY);
				this.lastSyncTime = Date.now();
				const setUpdateInterval = () =>
					(updateInterval = window.setInterval(() => {
						const sinceNow = Date.now() - this.lastSyncTime;
						const time = formatTime(sinceNow).replace(' ', '');
						sinceLastSyncText(` ${time} ago`);
					}, 60_000));
				if (result === 'cancelled') syncStage('cancelled');
				else if (result === 'completed') {
					syncStage('completed');
					setUpdateInterval();
				} else if (result === 'noop') {
					syncStage('completedNoop');
					setUpdateInterval();
				} else if (result === 'failed') {
					syncStage('failed');
					new Notice(`${t('failed')}: ${reason.error}`);
				}
				walkProgress({ completed: 0, total: 1 });
				executionProgress({ completed: 0, total: 0 });
			}),
			progressText.subscribe((text) => mobileSyncNotice?.setMessage(text)),
			() => {
				window.clearInterval(updateInterval);
				window.clearTimeout(noticeTimeout);
				mobileSyncNotice = undefined;
			},
		);
		const startIcon = addRibbonIcon('refresh-cw', t('startSync'), () => {
			if (isIdle()) void requestSync('manual');
		});
		const stopIcon = addRibbonIcon('square', t('stopSync'), () => dispatch('syncCanceled'));
		cleanupCallbacks.push(
			isIdle.subscribe(
				(idle) => {
					const svgIcon = startIcon.firstElementChild;
					if (!svgIcon) return;
					if (idle) {
						startIcon.removeAttribute('aria-disabled');
						svgIcon.removeClass('animate-spin');
						stopIcon.addClass('hidden');
					} else {
						startIcon.setAttr('aria-disabled', 'true');
						svgIcon.addClass('animate-spin');
						stopIcon.removeClass('hidden');
					}
				},
				{ immediate: true },
			),
		);
	};

	private readonly setupStatus = () => {
		const { ctx, t, progressText } = this;
		const { isIdle, addStatusBarItem } = ctx;
		const statusEl = addStatusBarItem();
		setIcon(statusEl, 'refresh-cw');
		const status = statusEl.createSpan({ cls: 'ml-1', text: t('idle') });
		this.cleanupCallbacks.push(
			isIdle.subscribe(
				(idle) => {
					const icon = statusEl.firstElementChild;
					if (!icon) return;
					if (idle) icon.removeClass('animate-spin');
					else icon.addClass('animate-spin');
				},
				{ immediate: true },
			),
			progressText.subscribe((text) => status.setText(text)),
		);
	};

	private readonly setupCommands = () =>
		[
			{
				checkCallback: (checking: boolean) => {
					if (checking) {
						if (!this.ctx.isIdle()) return false;
						return true;
					}
					void this.ctx.requestSync('manual');
				},
				icon: 'refresh-cw',
				id: 'start-sync',
				name: this.t('startSync'),
			},
			{
				checkCallback: (checking: boolean) => {
					if (checking) {
						if (!this.ctx.isIdle()) return false;
						return true;
					}
					void this.ctx.requestSync('nonInteractiveManual');
				},
				icon: 'refresh-ccw-dot',
				id: 'start-non-interactive-sync',
				name: this.t('startNonInteractiveSync'),
			},
			{
				checkCallback: (checking: boolean) => {
					if (checking) {
						if (this.ctx.isIdle()) return false;
						return true;
					}
					this.ctx.dispatch('syncCanceled');
				},
				icon: 'x-circle',
				id: 'stop-sync',
				name: this.t('stopSync'),
			},
			{
				checkCallback: (checking: boolean) => {
					if (checking) {
						if (this.ctx.isIdle()) return false;
						return true;
					}
					this.ctx.showProgress();
				},
				icon: 'activity',
				id: 'show-progress',
				name: this.t('showProgress'),
			},
			{
				callback: () => void this.exportLogs(),
				icon: 'scroll-text',
				id: 'export-logs',
				name: this.t('exportLogsToFile'),
			},
		].forEach((command) => this.ctx.addCommand(command));

	private readonly exportLogs = async () => {
		const { getLogs, app, dispatch, translate } = this.ctx;
		const log = getLogs();
		const timestamp = new Date().toISOString().replaceAll(/[:.]/gu, '-');
		const fileName = `${timestamp}.md`;
		const { exportLogsDirectory } = this.settings;
		const filePath = `${exportLogsDirectory === '/' ? '' : exportLogsDirectory}${fileName}`;
		try {
			await mkdirRecursive(app.vault.adapter, exportLogsDirectory);
			const file = await app.vault.create(filePath, log);
			await app.workspace.getLeaf().openFile(file);
		} catch (error) {
			const message = toErrorMessage(error);
			new Notice(`${translate('exportLogsFailed')}: ${message}`);
			dispatch('errorGeneral', `Export log failed: \`${message}\`.`);
		}
	};

	readonly dispose = () => {
		this.cleanupCallbacks.splice(0).forEach((fn) => fn());
		this.progressText.dispose();
	};

	root = {
		executionProgress: this.executionProgress,
		exportLogs: this.exportLogs,
		syncStage: this.syncStage,
		walkProgress: this.walkProgress,
	};
}

async function mkdirRecursive(adapter: DataAdapter, path: string): Promise<void> {
	const parts = path.split('/');
	let currentPath = '';
	for (const part of parts) {
		if (!part) return;
		currentPath = currentPath ? `${currentPath}/${part}` : part;
		if (!(await adapter.exists(currentPath))) await adapter.mkdir(currentPath);
	}
}
