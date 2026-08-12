import type { App } from 'obsidian';
import { Menu, Modal, SearchComponent, setIcon, setTooltip } from 'obsidian';
import { hook } from 'synthkernel';
import type { ModuleManagementTranslations } from '@/components/module-management';
import type { SourceEditorTranslations } from '@/components/SourceEditorModal';
import { mountModuleManagementList } from '@/components/module-management';
import ModuleSourceEditorModal from '@/components/SourceEditorModal';
import type { AugmentedModuleMeta } from './Extensibility';
import type { Translate } from './I18n';

type ModulesModalTranslations = ModuleManagementTranslations &
	SourceEditorTranslations & {
		searchModules: string;
		editSources: string;
		moduleManagement: string;
		showInstalledOnly: string;
		configurations: string;
	};

export default class ModulesModal extends Modal {
	private readonly t: Translate<ModulesModalTranslations>;
	private readonly modalCleanup: Array<() => void> = [];
	private sourceEditorModal?: ModuleSourceEditorModal;
	private showInstalledOnly = false;

	constructor(
		private readonly ctx: {
			app: App;
			translate: Translate<ModulesModalTranslations>;
			saveSettings: () => Promise<void>;
			fetchSources: (manual?: boolean) => Promise<Array<AugmentedModuleMeta>>;
			discoveredModules: Map<string, AugmentedModuleMeta>;
			loadedModules: Map<string, unknown>;
			downloadModule: (meta: AugmentedModuleMeta) => Promise<void>;
			deleteModule: (id: string) => Promise<void>;
			loadModule: (meta: AugmentedModuleMeta, start?: boolean) => Promise<void>;
			unloadModule: (id: string) => void;
			enableModule: (id: string) => Promise<void>;
			disableModule: (id: string) => void;
			updateModuleMeta: (meta: AugmentedModuleMeta) => Promise<void>;
		},
	) {
		super(ctx.app);
		this.t = ctx.translate;
		this.containerEl.getElementsByClassName('modal-bg')[0].addClass('opacity-0!');
		this.modalEl.addClasses(['sync-engine-large-modal', 'shadow-none!']);
	}

	declare readonly i18n: ModulesModalTranslations;
	declare readonly settings: { moduleSources: Array<string> };

	root = {
		closeModuleManagement: this.close.bind(this),
		openModuleManagement: this.open.bind(this),
	};

	onOpen() {
		this.setTitle(this.t('moduleManagement'));
		const controlsEl = this.contentEl.createDiv('flex items-center gap-2 pb-4');
		const searchEl = controlsEl.createDiv('min-w-0 flex-1');
		const listEl = this.contentEl.createDiv('min-h-0 overflow-y-auto');

		const onQuery = hook<[string]>();
		const onShowInstalledOnlyChange = hook<[boolean]>();
		const onSourcesChange = hook();

		const search = new SearchComponent(searchEl)
			.setPlaceholder(this.t('searchModules'))
			.onChange(onQuery);
		search.inputEl.addClass('w-full');
		search.inputEl.spellcheck = false;

		const menuButton = controlsEl.createEl('button', {
			attr: { 'aria-label': this.t('editSources'), type: 'button' },
			cls: 'clickable-icon flex-shrink-0 rounded-md',
		});
		setIcon(menuButton, 'menu');
		setTooltip(menuButton, this.t('configurations'));
		menuButton.onClickEvent((event) => {
			const menu = new Menu();
			menu.setNoIcon()
				.setParentElement(menuButton)
				.addItem((item) => {
					item.setTitle(this.t('showInstalledOnly'))
						.setChecked(this.showInstalledOnly)
						.onClick(() => {
							this.showInstalledOnly = !this.showInstalledOnly;
							onShowInstalledOnlyChange(this.showInstalledOnly);
						});
				})
				.addItem((item) => {
					item.setTitle(this.t('editSources')).onClick(() =>
						this.openSourceEditorModal(onSourcesChange),
					);
				});
			menu.showAtMouseEvent(event);
		});

		this.modalCleanup.push(
			mountModuleManagementList(listEl, this.ctx, {
				onQuery,
				onShowInstalledOnlyChange,
				onSourcesChange,
			}),
			() => {
				onQuery.clear();
				onShowInstalledOnlyChange.clear();
				onSourcesChange.clear();
			},
		);
		onShowInstalledOnlyChange(this.showInstalledOnly);
	}

	onClose() {
		this.modalCleanup.splice(0).forEach((fn) => fn());
		this.contentEl.empty();
	}

	private readonly openSourceEditorModal = (cb: () => void) => {
		this.sourceEditorModal?.close();
		this.sourceEditorModal = new ModuleSourceEditorModal(
			(sources) => {
				this.settings.moduleSources = sources;
				void this.ctx.saveSettings();
				cb();
			},
			{
				app: this.ctx.app,
				translate: this.t,
			},
			this.settings.moduleSources,
		).setCloseCallback(() => (this.sourceEditorModal = undefined));
		this.sourceEditorModal.open();
	};

	dispose() {
		this.sourceEditorModal?.close();
		this.sourceEditorModal = undefined;
		this.close();
	}
}
