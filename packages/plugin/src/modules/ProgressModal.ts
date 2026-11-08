import mountFileTree from '@/components/file-tree';
import renderFailedTasks from '@/components/render-failed-tasks';
import renderProgress from '@/components/render-progress';
import roundPercent from '@/utils/round-percent';
import { Modal, Setting } from 'obsidian';
import { computed, hook } from 'synthkernel';
import type { Dispatch, On } from './EventBus';
import type { Snippet, Translate } from './I18n';
import type { SyncStage } from './Observability';
import type { FailedTaskInfo, TaskInfo } from './Sync';
import type { Events, Translations } from '@';
import type { Task, RemoveLocal, TaskNames } from '@/sync';
import type { Progress } from '@/types';
import type { App } from 'obsidian';
import type { Ref } from 'synthkernel';

export type DeleteConfirmReturn = { delete: Array<RemoveLocal>; reupload: Array<RemoveLocal> };

type TaskCounts = { total: number; deleteLocal: number; deleteRemote: number; conflict: number };

export default class ProgressModal extends Modal {
	private readonly moduleCleanupCallbacks: Array<() => void> = [];
	private readonly modalCleanupCallbacks = hook();
	private opening = false;
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
		const { translate, dispatch } = ctx;
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
				this.description?.setText(translate('failedTasksDescription', failedTasks.length));
				renderFailedTasks(this.detailContainer as HTMLDivElement, failedTasks, translate);
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
					translate,
				);
				const cleanupUnmount = this.modalCleanupCallbacks.subscribe(unmount);
				this.description?.setText(translate('confirmDeleteDescription', tasks.length));
				this.showDetails();
				this.renderConfirmCancel(() => {
					const { selected, deselected } = getState();
					this.hideDetails();
					unmount();
					cleanupUnmount();
					dispatch('deleteConfirmed', {
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
					translate,
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
				this.description?.setText(translate('confirmTasksDescription', taskCounts));
				this.showDetails();
				this.renderConfirmCancel(() => {
					const { selected } = getState();
					this.hideDetails();
					unmount();
					cleanupUnmount();
					dispatch('tasksConfirmed', selected);
				});
			}),
		);
	}

	declare readonly events: { tasksConfirmed: Array<Task>; deleteConfirmed: DeleteConfirmReturn };

	declare readonly i18n: {
		syncProgress: string;
		completed: string;
		failedTasksDescription: Snippet<number>;
		confirmDeleteDescription: Snippet<number>;
		confirmTasksDescription: Snippet<TaskCounts>;
		hide: string;
		confirm: string;
		cancel: string;
		done: string;
		stopSync: string;
	} & Record<TaskNames | SyncStage, string>;

	private readonly renderHideStop = () => {
		if (!this.opening) return;
		const { translate, dispatch } = this.ctx;
		this.controls?.remove();
		this.controls = new Setting(this.contentEl)
			.addButton((button) => {
				button
					.setButtonText(translate('stopSync'))
					.setDestructive()
					.onClick(() => {
						dispatch('syncCanceled');
						return new Promise<void>((resolve) => {
							const unsub = this.ctx.on('syncTerminated', () => {
								resolve();
								unsub();
							});
						});
					});
			})
			.addButton((button) =>
				button.setButtonText(translate('hide')).onClick(() => this.close()),
			).settingEl;
	};
	private readonly renderConfirmCancel = (confirmCallback: () => void) => {
		if (!this.opening) return;
		const { translate, dispatch } = this.ctx;
		this.controls?.remove();
		this.controls = new Setting(this.contentEl)
			.addButton((button) => {
				button
					.setButtonText(translate('cancel'))
					.setDestructive()
					.onClick(() => this.close());
			})
			.addButton((button) =>
				button
					.setButtonText(translate('confirm'))
					.setCta()
					.onClick(() => {
						cleanup();
						confirmCallback();
					})
					.buttonEl.focus(),
			).settingEl;
		const cleanup = this.modalCleanupCallbacks.subscribe(() => dispatch('syncCanceled'));
	};
	private readonly renderDone = () => {
		if (!this.opening) return;
		this.controls?.remove();
		this.controls = new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(this.ctx.translate('done'))
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
		const {
			contentEl,
			modalCleanupCallbacks,
			ctx: { translate, syncStage, walkProgress, executionProgress },
		} = this;
		this.setTitle(translate('syncProgress'));

		const progress = computed<{
			completed?: number;
			total?: number;
			percent?: number;
			current?: string;
		}>(
			() => {
				const stage = syncStage();
				if (stage === 'walkingRemote') {
					const { completed, current, total } = walkProgress();
					return {
						completed,
						current: current
							? `${translate('walkingRemote')} ${current}`
							: translate('walkingRemote'),
						percent: roundPercent(completed, total),
						total,
					};
				} else if (stage === 'executing') {
					const { completed, current, total } = executionProgress();
					return {
						completed,
						current: current
							? `${translate(current.name)} ${current.key}`
							: translate('executing'),
						percent: roundPercent(completed, total),
						total,
					};
				} else if (stage === 'awaitingConfirmation')
					return {
						completed: 0,
						current: translate('awaitingConfirmation'),
						percent: 0,
						total: 1,
					};
				else if (stage === 'none') return {};
				else if (stage === 'cancelled') return { current: translate('cancelled') };
				else if (stage === 'completed') return { current: translate('completed') };
				else if (stage === 'completedNoop')
					return {
						completed: 0,
						current: translate('completedNoop'),
						percent: 100,
						total: 0,
					};
				return { current: translate('failed') };
			},
			{ deps: [walkProgress, syncStage, executionProgress] },
		);

		const container = contentEl.createDiv('flex flex-col gap-4 max-h-75vh py-3');
		const { bar, left, right } = renderProgress(container);
		this.description = container.createEl('p', 'whitespace-pre-line hidden my-0');
		this.detailContainer = container.createDiv(
			'max-h-50vh overflow-y-auto rounded-lg border border-[--background-modifier-border] bg-[--background-secondary] p-3 hidden',
		);

		modalCleanupCallbacks.subscribe(
			progress.subscribe(
				({ completed, current, percent, total }) => {
					if (completed !== undefined && total !== undefined)
						right.setText(`${completed}/${total} ${translate('completed')}`);
					if (current !== undefined) left.setText(current);
					if (percent !== undefined) bar.setValue(percent);
				},
				{ immediate: true },
			),
		);
		modalCleanupCallbacks.subscribe(() => progress.dispose());
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
