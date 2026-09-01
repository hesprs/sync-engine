import type { Settings } from '@';
import { App, Menu, SearchComponent, setIcon, SettingPage, Notice, MenuItem } from 'obsidian';
import { hook } from 'synthkernel';
import type { ModuleManagementTranslations } from '@/components/module-management';
import type { ModuleEditorTranslations } from '@/components/ModuleEditorModal';
import type { AugmentedModuleMeta } from '@/modules/Extensibility';
import type { Fragment, Translate } from '@/modules/I18n';
import type { MaybePromise } from '@/types';
import { mountModuleManagementList } from '@/components/module-management';
import ModuleEditorModal from '@/components/ModuleEditorModal';
import { MODULE_EXTENSION } from '@/modules/Extensibility';

export type ModulesTranslations = ModuleEditorTranslations &
	ModuleManagementTranslations & {
		searchModules: string;
		moduleManagement: string;
		showInstalledOnly: string;
		installModuleFromFile: string;
		moduleExtensionWarning: Fragment;
	};

export default class ModuleManagement extends SettingPage {
	private readonly t: Translate<ModulesTranslations>;
	private readonly cleanup: Array<() => void> = [];
	private showInstalledOnly = false;

	constructor(
		private readonly ctx: {
			app: App;
			translate: Translate<ModulesTranslations>;
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
			installModule: (meta: AugmentedModuleMeta, module: string) => Promise<void>;
			settings: Settings;
			pluginOutdated: boolean;
		},
	) {
		super();
		this.title = ctx.translate('moduleManagement');
		this.t = ctx.translate;
	}

	display() {
		const { containerEl, t, ctx, cleanup } = this;
		const { installModule } = ctx;
		const controlsEl = containerEl.createDiv('flex items-center gap-2 pb-4');
		const searchEl = controlsEl.createDiv('min-w-0 flex-1');
		const listEl = containerEl.createDiv('min-h-0 overflow-y-auto');
		const onQuery = hook<[string]>();
		const onShowInstalledOnlyChange = hook<[boolean]>();
		const onInstallModuleFromFile = hook();

		const search = new SearchComponent(searchEl)
			.setPlaceholder(t('searchModules'))
			.onChange(onQuery);
		search.inputEl.addClass('w-full');
		search.inputEl.spellcheck = false;

		const menuButton = controlsEl.createEl('button', 'clickable-icon flex-shrink-0 rounded-md');
		setIcon(menuButton, 'settings');

		const menu = new Menu()
			.addItem((item) =>
				item
					.setIcon('hard-drive-download')
					.setTitle(t('showInstalledOnly'))
					.setChecked(this.showInstalledOnly)
					.onClick(() => {
						this.showInstalledOnly = !this.showInstalledOnly;
						item.setChecked(this.showInstalledOnly);
						onShowInstalledOnlyChange(this.showInstalledOnly);
					}),
			)
			.addItem((item) =>
				pickFile(
					item.setIcon('package').setTitle(t('installModuleFromFile')),
					async (fileObj) => {
						if (!fileObj.name.endsWith(MODULE_EXTENSION)) {
							new Notice(t('moduleExtensionWarning'));
							return;
						}
						const file = await fileObj.text();
						new ModuleEditorModal(ctx, {
							file,
							initial: {
								id: fileObj.name
									.slice(0, -MODULE_EXTENSION.length)
									.normalize('NFC'),
							},
							onSave: async (meta) => {
								await installModule(meta, file);
								onInstallModuleFromFile();
							},
						}).open();
					},
				),
			);
		menuButton.onClickEvent((event) => menu.showAtMouseEvent(event));

		cleanup.push(
			mountModuleManagementList(listEl, ctx, {
				onInstallModuleFromFile,
				onQuery,
				onShowInstalledOnlyChange,
			}),
			() => {
				onQuery.clear();
				onShowInstalledOnlyChange.clear();
			},
		);
		onShowInstalledOnlyChange(this.showInstalledOnly);
	}

	hide() {
		this.cleanup.splice(0).forEach((fn) => fn());
		this.containerEl.empty();
	}
}

function pickFile(item: MenuItem, handler: (file: File) => MaybePromise<void>) {
	item.dom.addClass('relative');
	const input = item.dom.createEl('input', {
		attr: { accept: '.js' },
		cls: 'absolute top-0 bottom-0 left-0 right-0 opacity-0',
		type: 'file',
	});
	input.addEventListener('change', (e) => {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		void handler(file);
	});
}
