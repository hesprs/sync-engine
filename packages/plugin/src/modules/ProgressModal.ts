import type { Events, Translations } from '@';
import type { App } from 'obsidian';
import type { Ref } from 'synthkernel';
import { Modal, Setting } from 'obsidian';
import { computed, hook } from 'synthkernel';
import type { BaseTask, RemoveLocal, TaskNames } from '@/sync';
import type { Progress } from '@/types';
import mountFileTree from '@/components/file-tree';
import renderFailedTasks from '@/components/render-failed-tasks';
import renderProgress from '@/components/render-progress';
import roundPercent from '@/utils/round-percent';
import type { Dispatch, On } from './EventBus';
import type { Fragment, Translate } from './I18n';
import type { SyncStage } from './Observability';
import type { FailedTaskInfo, TaskInfo } from './Sync';

export type DeleteConfirmReturn = {
	delete: Array<RemoveLocal>;
	reupload: Array<RemoveLocal>;
};

type TaskCounts = {
	total: number;
	deleteLocal: number;
	deleteRemote: number;
	conflict: number;
};

export default class ProgressModal extends Modal {
	private readonly moduleCleanupCallbacks: Array<() => void> = [];
	private readonly t: Translate<Translations>;
	private opening = false;
	private readonly modalCleanupCallbacks = hook();
	private readonly dispatch: Dispatch<Events>;
	private description?: HTMLParagraphElement;
	private detailContainer?: HTMLDivElement;
	private controls?: HTMLElement;

	constructor(
		private readonly ctx: {
			app: App;
			translate: Translate<Translations>;
			on: On<Events>;
			dispatch: Dispatch<Events>;
			syncStage: Ref<SyncStage>;
			walkProgress: Ref<Progress>;
			executionProgress: Ref<Progress<TaskInfo>>;
		},
	) {
		super(ctx.app);
		this.t = ctx.translate;
		this.dispatch = ctx.dispatch;
		const failedTasks: Array<FailedTaskInfo> = [];
		this.moduleCleanupCallbacks.push(
			ctx.on('syncStarted', ({ trigger }) => {
				if (trigger === 'manual') this.open();
				this.renderHideStop();
			}),
			ctx.on('executionStarted', this.renderHideStop),
			ctx.on('taskFailed', (task) => failedTasks.push(task)),
			ctx.on('syncTerminated', () => {
				this.renderDone();
				if (!failedTasks.length) return;
				if (!this.opening) {
					this.open();
					this.renderDone();
				}
				this.description?.setText(
					this.t('failedTasksDescription', { x: failedTasks.length }),
				);
				renderFailedTasks(this.detailContainer as HTMLDivElement, failedTasks);
				this.showDetails();
				failedTasks.length = 0;
			}),
			ctx.on('requestConfirmDelete', (tasks) => {
				let shouldClose = false;
				if (!this.opening) {
					this.open();
					shouldClose = true;
				}
				const { unmount, getState } = mountFileTree(
					this.detailContainer as HTMLDivElement,
					tasks,
					this.t,
				);
				const cleanupUnmount = this.modalCleanupCallbacks.subscribe(unmount);
				this.description?.setText(this.t('confirmDeleteDescription', { x: tasks.length }));
				this.showDetails();
				this.renderConfirmCancel(() => {
					const { selected, deselected } = getState();
					this.hideDetails();
					unmount();
					cleanupUnmount();
					this.dispatch('deleteConfirmed', {
						delete: selected as Array<RemoveLocal>,
						reupload: deselected as Array<RemoveLocal>,
					});
					if (shouldClose) this.close();
				});
			}),
			ctx.on('requestConfirmTasks', (tasks) => {
				if (!this.opening) this.open();
				const { unmount, getState } = mountFileTree(
					this.detailContainer as HTMLDivElement,
					tasks,
					this.t,
				);
				const cleanupUnmount = this.modalCleanupCallbacks.subscribe(unmount);
				const taskCounts: TaskCounts = {
					conflict: 0,
					deleteLocal: 0,
					deleteRemote: 0,
					total: tasks.length,
				};
				for (const { name } of tasks)
					if (name === 'removeLocal') taskCounts.deleteLocal++;
					else if (name === 'removeRemote') taskCounts.deleteRemote++;
					else if (name === 'resolveConflict') taskCounts.conflict++;
				this.description?.setText(this.t('confirmTasksDescription', taskCounts));
				this.showDetails();
				this.renderConfirmCancel(() => {
					const { selected } = getState();
					this.hideDetails();
					unmount();
					cleanupUnmount();
					this.dispatch('tasksConfirmed', selected);
				});
			}),
		);
	}

	declare readonly events: {
		tasksConfirmed: Array<BaseTask>;
		deleteConfirmed: DeleteConfirmReturn;
	};

	declare readonly i18n: {
		syncProgress: string;
		completed: string;
		failedTasksDescription: string;
		confirmDeleteDescription: string;
		confirmTasksDescription: Fragment<TaskCounts>;
		hide: string;
		confirm: string;
		cancel: string;
		done: string;
		stopSync: string;
	} & Record<TaskNames | SyncStage, string>;

	private readonly renderHideStop = () => {
		if (!this.opening) return;
		this.controls?.remove();
		this.controls = new Setting(this.contentEl)
			.addButton((button) => {
				button
					.setButtonText(this.t('stopSync'))
					.setDestructive()
					.onClick(() => {
						this.dispatch('syncCanceled');
						return new Promise<void>((resolve) => {
							const unsub = this.ctx.on('syncTerminated', () => {
								resolve();
								unsub();
							});
						});
					});
			})
			.addButton((button) =>
				button.setButtonText(this.t('hide')).onClick(() => this.close()),
			).settingEl;
	};
	private readonly renderConfirmCancel = (confirmCallback: () => void) => {
		if (!this.opening) return;
		this.controls?.remove();
		this.controls = new Setting(this.contentEl)
			.addButton((button) => {
				button
					.setButtonText(this.t('cancel'))
					.setDestructive()
					.onClick(() => this.close());
			})
			.addButton((button) =>
				button
					.setButtonText(this.t('confirm'))
					.setCta()
					.onClick(() => {
						cleanup();
						confirmCallback();
					})
					.buttonEl.focus(),
			).settingEl;
		const cleanup = this.modalCleanupCallbacks.subscribe(() => this.dispatch('syncCanceled'));
	};
	private readonly renderDone = () => {
		if (!this.opening) return;
		this.controls?.remove();
		this.controls = new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(this.t('done'))
				.setCta()
				.onClick(() => this.close())
				.buttonEl.focus(),
		).settingEl;
	};

	private readonly showDetails = () => {
		this.description?.removeClass('hidden');
		this.detailContainer?.removeClass('hidden');
	};
	private readonly hideDetails = () => {
		this.description?.addClass('hidden');
		this.detailContainer?.addClass('hidden');
	};

	onOpen() {
		const { contentEl } = this;
		this.setTitle(this.t('syncProgress'));

		const progress = computed<{
			completed?: number;
			total?: number;
			percent?: number;
			current?: string;
		}>(
			() => {
				const stage = this.ctx.syncStage();
				if (stage === 'walkingRemote') {
					const { completed, current, total } = this.ctx.walkProgress();
					return {
						completed,
						current: current
							? `${this.t('walkingRemote')} ${current}`
							: this.t('walkingRemote'),
						percent: roundPercent(completed, total),
						total,
					};
				} else if (stage === 'executing') {
					const { completed, current, total } = this.ctx.executionProgress();
					return {
						completed,
						current: current
							? `${this.t(current.name)} ${current.key}`
							: this.t('executing'),
						percent: roundPercent(completed, total),
						total,
					};
				} else if (stage === 'awaitingConfirmation')
					return {
						completed: 0,
						current: this.t('awaitingConfirmation'),
						percent: 0,
						total: 1,
					};
				else if (stage === 'none') return {};
				else if (stage === 'cancelled') return { current: this.t('cancelled') };
				else if (stage === 'completed') return { current: this.t('completed') };
				else if (stage === 'completedNoop')
					return {
						completed: 0,
						current: this.t('completedNoop'),
						percent: 100,
						total: 0,
					};
				return { current: this.t('failed') };
			},
			{ deps: [this.ctx.walkProgress, this.ctx.syncStage, this.ctx.executionProgress] },
		);

		const container = contentEl.createDiv('flex flex-col gap-4 max-h-[75vh] pt-3 pb-3');
		const { bar, left, right } = renderProgress(container);
		this.description = container.createEl('p', 'whitespace-pre-line hidden my-0');
		this.detailContainer = container.createDiv(
			'max-h-[50vh] overflow-y-auto rounded-lg border border-[--background-modifier-border] bg-[--background-secondary] p-2 hidden',
		);

		this.modalCleanupCallbacks.subscribe(
			progress.subscribe(
				({ completed, current, percent, total }) => {
					if (completed !== undefined && total !== undefined)
						right.setText(`${completed}/${total} ${this.t('completed')}`);
					if (current !== undefined) left.setText(current);
					if (percent !== undefined) bar.setValue(percent);
				},
				{ immediate: true },
			),
		);
		this.modalCleanupCallbacks.subscribe(() => progress.dispose());
		this.opening = true;
	}

	root = {
		hideProgress: this.close.bind(this),
		showProgress: () => {
			this.open();
			this.renderHideStop();
		},
	};

	onClose() {
		this.opening = false;
		this.description = undefined;
		this.detailContainer = undefined;
		this.controls = undefined;
		this.modalCleanupCallbacks();
		this.modalCleanupCallbacks.clear();
		this.contentEl.empty();
	}

	dispose() {
		this.onClose();
		this.moduleCleanupCallbacks.splice(0).forEach((fn) => fn());
	}
}
