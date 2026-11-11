import roundPercent from '@/utils/round-percent';
import { formatTime } from '@/utils/unit-converter';
import { describeError, toError } from '@repo/shared/error';
import { Notice, Platform, setIcon } from 'obsidian';
import { computed, ref } from 'synthkernel';
import type { Dispatch, On } from './EventBus';
import type { Translate } from './I18n';
import type { SyncTerminateReason, TaskInfo } from './Sync';
import type { Events, Translations } from '@';
import type { Progress } from '@/types';
import type { App, Command, DataAdapter, Plugin, WorkspaceLeaf } from 'obsidian';
import type { Ref } from 'synthkernel';

export type SyncStage =
	| 'none'
	| 'walkingRemote'
	| 'awaitingConfirmation'
	| 'executing'
	| 'completed'
	| 'completedNoop'
	| 'cancelled'
	| 'failed';

export type StatusLevel = 'ok' | 'warning' | 'error';

export type ModuleStatus = { level: StatusLevel; message?: string };

const MOBILE_SYNC_NOTICE_HIDE_DELAY = 2000;

function renderSyncIcon(
	container: HTMLElement,
	badge?: 'warning' | 'error',
	spinning = false,
): void {
	container.empty();
	container.style.position = 'relative';
	container.style.display = 'inline-flex';
	container.style.alignItems = 'center';
	container.style.justifyContent = 'center';

	const mainWrapper = container.createSpan({ cls: 'sync-engine-main-icon' });
	mainWrapper.style.display = 'inline-flex';
	mainWrapper.style.alignItems = 'center';
	mainWrapper.style.justifyContent = 'center';
	setIcon(mainWrapper, 'refresh-cw');
	if (spinning) mainWrapper.addClass('animate-spin');
	const mainSvg = mainWrapper.firstElementChild as HTMLElement | undefined;
	if (mainSvg && spinning) mainSvg.addClass('animate-spin');

	if (badge === 'warning') {
		const badgeWrapper = container.createSpan({ cls: 'sync-engine-badge-icon' });
		badgeWrapper.style.position = 'absolute';
		badgeWrapper.style.bottom = '-2px';
		badgeWrapper.style.right = '-2px';
		badgeWrapper.style.width = '60%';
		badgeWrapper.style.height = '60%';
		badgeWrapper.style.display = 'inline-flex';
		badgeWrapper.style.alignItems = 'center';
		badgeWrapper.style.justifyContent = 'center';
		badgeWrapper.style.pointerEvents = 'none';
		setIcon(badgeWrapper, 'alert-circle');
		const badgeSvg = badgeWrapper.firstElementChild as HTMLElement | null;
		if (badgeSvg) {
			badgeSvg.style.width = '100%';
			badgeSvg.style.height = '100%';
			badgeSvg.style.stroke = 'var(--text-warning, #f59e0b)';
			badgeSvg.style.fill = 'var(--background-primary, #1e1e1e)';
			badgeSvg.style.strokeWidth = '2.5';
		}
	} else if (badge === 'error') {
		const badgeWrapper = container.createSpan({ cls: 'sync-engine-badge-icon' });
		badgeWrapper.style.position = 'absolute';
		badgeWrapper.style.bottom = '-2px';
		badgeWrapper.style.right = '-2px';
		badgeWrapper.style.width = '60%';
		badgeWrapper.style.height = '60%';
		badgeWrapper.style.display = 'inline-flex';
		badgeWrapper.style.alignItems = 'center';
		badgeWrapper.style.justifyContent = 'center';
		badgeWrapper.style.pointerEvents = 'none';
		setIcon(badgeWrapper, 'x-circle');
		const badgeSvg = badgeWrapper.firstElementChild as HTMLElement | null;
		if (badgeSvg) {
			badgeSvg.style.width = '100%';
			badgeSvg.style.height = '100%';
			badgeSvg.style.stroke = 'var(--text-error, #f85149)';
			badgeSvg.style.fill = 'var(--background-primary, #1e1e1e)';
			badgeSvg.style.strokeWidth = '2.5';
		}
	}
}

export default class Observability {
	private lastSyncTime = 0;
	private lastFailure?: string;
	private readonly sinceLastSyncText = ref('');
	private readonly syncStage = ref<SyncStage>('none');
	private readonly walkProgress = ref<Progress>({ completed: 0, total: 1 });
	private readonly executionProgress = ref<Progress<TaskInfo>>({ completed: 0, total: 0 });
	private readonly cleanupCallbacks: Array<() => void> = [];
	private readonly moduleStatuses = new Map<string, ModuleStatus>();
	private startIconEl?: HTMLElement;
	private statusIconEl?: HTMLElement;
	private statusEl?: HTMLElement;
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
			else if (stage === 'failed') return `${this.t('failed')}: ${this.lastFailure}`;
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
			addRibbonIcon: Plugin['addRibbonIcon'];
			getLogs: () => string;
			app: App;
		},
	) {
		this.t = ctx.translate;
	}

	readonly setModuleStatus = (id: string, status?: ModuleStatus): (() => void) => {
		if (!status || status.level === 'ok') this.moduleStatuses.delete(id);
		else this.moduleStatuses.set(id, status);
		this.updateAllIcons();
		return () => {
			this.moduleStatuses.delete(id);
			this.updateAllIcons();
		};
	};

	readonly getModuleStatus = (id: string): ModuleStatus | undefined =>
		this.moduleStatuses.get(id);

	private computeBadge(): { badge?: 'warning' | 'error'; message?: string } {
		if (this.syncStage() === 'failed' && this.lastFailure)
			return { badge: 'error', message: `${this.t('failed')}: ${this.lastFailure}` };
		let hasWarning = false;
		let warningMessage: string | undefined;
		for (const [id, status] of this.moduleStatuses) {
			if (status.level === 'error') return { badge: 'error', message: status.message ?? id };
			if (status.level === 'warning') {
				hasWarning = true;
				warningMessage ??= status.message ?? id;
			}
		}
		if (hasWarning) return { badge: 'warning', message: warningMessage };
		return {};
	}

	private readonly updateAllIcons = () => {
		const isIdle = this.ctx.isIdle();
		const spinning = !isIdle;
		const { badge, message } = this.computeBadge();

		if (this.startIconEl) {
			renderSyncIcon(this.startIconEl, badge, spinning);
			const baseTitle = this.t('startSync');
			const title = message ? `${baseTitle} (${message})` : baseTitle;
			this.startIconEl.setAttribute('aria-label', title);
			this.startIconEl.setAttribute('title', title);
		}

		if (this.statusIconEl) {
			renderSyncIcon(this.statusIconEl, badge, spinning);
			if (this.statusEl)
				if (message) this.statusEl.setAttribute('title', message);
				else this.statusEl.removeAttribute('title');
		}

		this.updateMobileHeaderIcons();
	};

	private readonly cleanupMobileHeaderIcons = () => {
		if (typeof document !== 'undefined') {
			document.querySelectorAll('.sync-engine-mobile-action').forEach((el) => el.remove());
			document.querySelectorAll('.sync-engine-collab-action').forEach((el) => el.remove());
		}
		if (this.ctx.app.workspace?.iterateRootLeaves)
			this.ctx.app.workspace.iterateRootLeaves((leaf: WorkspaceLeaf) => {
				const container = leaf.view?.containerEl;
				if (!container) return;
				const viewActions =
					container.querySelector('.view-actions') ??
					container.closest('.workspace-leaf-content')?.querySelector('.view-actions');
				if (!viewActions) return;
				viewActions
					.querySelectorAll('.sync-engine-mobile-action')
					.forEach((el) => el.remove());
				viewActions
					.querySelectorAll('.sync-engine-collab-action')
					.forEach((el) => el.remove());
			});
	};

	private readonly updateMobileHeaderIcons = () => {
		if (!Platform.isMobile) return;
		if (!this.ctx.app.workspace?.iterateRootLeaves) return;

		const isIdle = this.ctx.isIdle();
		const spinning = !isIdle;
		const { badge, message } = this.computeBadge();
		const baseTitle = this.t('startSync');
		const title = message ? `${baseTitle} (${message})` : baseTitle;

		this.ctx.app.workspace.iterateRootLeaves((leaf: WorkspaceLeaf) => {
			const container = leaf.view?.containerEl;
			if (!container) return;
			const viewActions =
				container.querySelector('.view-actions') ??
				container.closest('.workspace-leaf-content')?.querySelector('.view-actions');
			if (!viewActions) return;

			viewActions.querySelectorAll('.sync-engine-collab-action').forEach((el) => el.remove());

			let btn = viewActions.querySelector<HTMLElement>('.sync-engine-mobile-action');
			if (!btn) {
				btn = viewActions.createEl('button', {
					cls: 'clickable-icon view-action sync-engine-mobile-action',
				});
				viewActions.prepend(btn);
				btn.addEventListener('click', (e) => {
					e.stopPropagation();
					const current = this.computeBadge();
					if (current.message) new Notice(current.message);
					if (this.ctx.isIdle()) void this.ctx.requestSync('manual');
					else this.ctx.showProgress();
				});
			}

			renderSyncIcon(btn, badge, spinning);
			btn.setAttribute('aria-label', title);
			btn.setAttribute('title', title);
		});
	};

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
				this.lastFailure = undefined;
				this.updateAllIcons();
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
				executionProgress({ completed: 0, total: totalSyncTasks });
				syncStage('executing');
			}),
			on('remoteWalkProgress', (progress) => walkProgress(progress)),
			on('taskCompleted', (current) => {
				completedTasks += 1;
				executionProgress({ completed: completedTasks, current, total: totalSyncTasks });
			}),
			on('syncTerminated', (reason) => {
				const { result } = reason;
				if (mobileSyncNotice)
					noticeTimeout = window.setTimeout(() => {
						mobileSyncNotice?.hide();
						mobileSyncNotice = undefined;
					}, MOBILE_SYNC_NOTICE_HIDE_DELAY);
				this.lastSyncTime = Date.now();
				const setUpdateInterval = () =>
					(updateInterval = window.setInterval(() => {
						const sinceNow = Date.now() - this.lastSyncTime;
						const time = formatTime(sinceNow);
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
					this.lastFailure = reason.error.message;
					syncStage('failed');
				}
				if (result !== 'failed') this.lastFailure = undefined;
				this.updateAllIcons();
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
		this.startIconEl = startIcon;
		const stopIcon = addRibbonIcon('square', t('stopSync'), () => dispatch('syncCanceled'));
		cleanupCallbacks.push(
			isIdle.subscribe(
				(idle) => {
					if (idle) {
						startIcon.removeAttribute('aria-disabled');
						stopIcon.addClass('hidden');
					} else {
						startIcon.setAttr('aria-disabled', 'true');
						stopIcon.removeClass('hidden');
					}
					this.updateAllIcons();
				},
				{ immediate: true },
			),
		);
		if (Platform.isMobile) {
			const onLeafChange = () => {
				this.updateMobileHeaderIcons();
			};
			const leafRef = this.ctx.app.workspace?.on?.('active-leaf-change', onLeafChange);
			const layoutRef = this.ctx.app.workspace?.on?.('layout-change', onLeafChange);
			cleanupCallbacks.push(() => {
				if (leafRef) this.ctx.app.workspace?.offref?.(leafRef);
				if (layoutRef) this.ctx.app.workspace?.offref?.(layoutRef);
				this.cleanupMobileHeaderIcons();
			});
			this.updateMobileHeaderIcons();
		}
	};

	private readonly setupStatus = () => {
		const { ctx, t, progressText } = this;
		const { addStatusBarItem } = ctx;
		const statusEl = addStatusBarItem();
		this.statusEl = statusEl;
		const iconWrap = statusEl.createSpan({ cls: 'sync-engine-status-icon-wrap' });
		this.statusIconEl = iconWrap;
		const status = statusEl.createSpan({ cls: 'ml-1 max-w-250px truncate', text: t('idle') });
		this.updateAllIcons();
		this.cleanupCallbacks.push(progressText.subscribe((text) => status.setText(text)));
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
			const parsedError = toError(error);
			new Notice(`${translate('exportLogsFailed')}: ${parsedError.message}`);
			dispatch('errorGeneral', describeError(parsedError, 'Export log failed'));
		}
	};

	readonly dispose = () => {
		this.cleanupCallbacks.splice(0).forEach((fn) => fn());
		this.progressText.dispose();
	};

	root = {
		executionProgress: this.executionProgress,
		exportLogs: this.exportLogs,
		getModuleStatus: this.getModuleStatus,
		setModuleStatus: this.setModuleStatus,
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
