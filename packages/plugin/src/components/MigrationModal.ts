import type { Events } from '@';
import type { App, ToggleComponent } from 'obsidian';
import { Modal, Notice, Setting } from 'obsidian';
import { ref } from 'synthkernel';
import type { ExistingMemoryDB } from '@/modules/Bootstrap';
import type { Dispatch } from '@/modules/EventBus';
import type { Translate } from '@/modules/I18n';
import type { Infras } from '@/modules/Registrar';
import type { SyncTerminateReason } from '@/modules/Sync';
import type { MaybePromise } from '@/types';
import renderProgress from '@/components/render-progress';
import roundPercent from '@/utils/round-percent';
import toErrorMessage from '@/utils/to-error-message';

export type MigrationModalTranslations = {
	cancel: string;
	remoteMigration: string;
	migrationProcess: string;
	startMigration: string;
	migrationDescription: string;
	migrationPhase1Description: string;
	migrationPhase2Description: string;
	migrationPhase3Description: string;
	toggleWithoutMigration: string;
	migrationFailed: string;
	completed: string;
	hide: string;
	done: string;
};

type MigrationContext = {
	app: App;
	dispatch: Dispatch<Events>;
	translate: Translate<MigrationModalTranslations>;
	requestSync: (trigger: string) => Promise<SyncTerminateReason>;
	initializeSync: () => Infras;
	memoryDB: ExistingMemoryDB;
};

class MigrationModal extends Modal {
	private readonly cleanupCallbacks: Array<() => void> = [];
	private readonly completed = ref(0);
	private readonly current = ref('');

	constructor(
		private readonly ctx: MigrationContext,
		private readonly options: {
			content: string | DocumentFragment;
			apply: () => MaybePromise<void>;
		},
	) {
		super(ctx.app);
		this.contentEl.addClass('markdown-rendered');
		this.setTitle(ctx.translate('remoteMigration'));
	}

	onOpen() {
		const {
			contentEl,
			options: { content, apply },
		} = this;
		const { translate } = this.ctx;
		contentEl.empty();

		if (typeof content === 'string')
			contentEl.createEl('p', { cls: 'whitespace-pre-wrap', text: content });
		else contentEl.append(content);
		contentEl.createEl('p', {
			cls: 'whitespace-pre-wrap',
			text: translate('migrationDescription'),
		});

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText(translate('cancel')).onClick(this.close.bind(this)),
			)
			.addButton((button) =>
				button.setButtonText(translate('toggleWithoutMigration')).onClick(async () => {
					await apply();
					this.close();
				}),
			)
			.addButton((button) =>
				button
					.setButtonText(translate('startMigration'))
					.setCta()
					.onClick(this.handleMigration),
			);
	}

	private readonly handleMigration = () => {
		const { current, completed, ctx, cleanupCallbacks, contentEl, migrate } = this;
		const { translate, dispatch } = ctx;
		contentEl.empty();
		this.setTitle(translate('migrationProcess'));
		const { left, right, bar } = renderProgress(contentEl, 'mb-3');

		let controls: HTMLElement | undefined;
		const renderControls = (text: 'hide' | 'done') => {
			controls?.remove();
			controls = new Setting(contentEl).addButton((button) =>
				button.setButtonText(translate(text)).onClick(() => this.close()),
			).settingEl;
		};
		renderControls('hide');

		cleanupCallbacks.push(
			completed.subscribe((value) => {
				right.setText(`${value}/3 ${translate('completed')}`);
				bar.setValue(roundPercent(value, 3));
			}),
			current.subscribe((value) => left.setText(value)),
		);

		void migrate().then((result) => {
			renderControls('done');
			if (!result.success) {
				dispatch('errorGeneral', 'Migration failed.');
				left.setText(translate('migrationFailed'));
			}
		});
	};

	private readonly migrate = async (): Promise<
		{ success: true } | { success: false; reason: string }
	> => {
		const { current, completed, ctx } = this;
		const { dispatch, requestSync, initializeSync, translate, memoryDB } = ctx;
		const handleSyncResult = (sync: SyncTerminateReason, phase: number) => {
			if (sync.result === 'failed')
				return { reason: `Phase ${phase}: ${sync.error}`, success: false };
			else if (sync.result === 'cancelled')
				return { reason: `Phase ${phase}: sync cancelled`, success: false };
		};
		dispatch('logGeneral', 'Migration started.');
		completed(0);
		current(translate('migrationPhase1Description'));

		const phase1 = handleSyncResult(await requestSync('nonInteractiveManual'), 1);
		if (phase1) return phase1;
		completed(1);
		current(translate('migrationPhase2Description'));

		try {
			const { record, remoteFs } = initializeSync();
			await Promise.all([
				record.clear(),
				this.options.apply(),
				...memoryDB
					.getStore('remoteContext20000')
					.keys()
					.sort((a, b) => b.length - a.length)
					.map((key) => remoteFs.delete(key)),
			]);
		} catch (error) {
			const message = toErrorMessage(error);
			new Notice(`${translate('migrationFailed')}: ${message}`);
			return { reason: `Phase 2: ${message}`, success: false };
		}
		completed(2);
		current(translate('migrationPhase3Description'));

		const phase3 = handleSyncResult(await requestSync('migration'), 3);
		if (phase3) return phase3;
		completed(3);
		current(translate('completed'));
		return { success: true };
	};

	onClose() {
		this.cleanupCallbacks.splice(0).forEach((fn) => fn());
		this.contentEl.empty();
	}
}

export default function setNeedMigration(
	ctx: MigrationContext,
	{
		toggle,
		needMigration,
		content,
		apply,
	}: {
		toggle: ToggleComponent;
		needMigration?: (value: boolean) => MaybePromise<boolean>;
		content: (value: boolean) => string | DocumentFragment;
		apply: (value: boolean) => MaybePromise<void>;
	},
) {
	let selfTrigger = false;
	toggle.onChange((value) => {
		if (selfTrigger) {
			selfTrigger = false;
			return;
		}
		const showMigration = async (need: boolean) => {
			if (need) {
				selfTrigger = true;
				toggle.setValue(!value); // Revert UI back, not migrated yet
				new MigrationModal(ctx, {
					apply: async () => {
						await apply(value);
						selfTrigger = true;
						toggle.setValue(value);
					},
					content: content(value),
				}).open();
			} else await apply(value);
		};
		const need = needMigration?.(value) ?? true;
		if (need instanceof Promise) void need.then(showMigration);
		else void showMigration(need);
	});
}
