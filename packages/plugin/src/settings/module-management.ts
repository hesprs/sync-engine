import type { Settings } from '@';
import { App, SearchComponent, setIcon, SettingPage, setTooltip } from 'obsidian';
import { hook } from 'synthkernel';
import type { ModuleManagementTranslations } from '@/components/module-management';
import type { AugmentedModuleMeta } from '@/modules/Extensibility';
import type { Translate } from '@/modules/I18n';
import { mountModuleManagementList } from '@/components/module-management';

export type ModulesTranslations = ModuleManagementTranslations & {
	searchModules: string;
	moduleManagement: string;
	showInstalledOnly: string;
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
			settings: Settings;
			pluginOutdated: boolean;
		},
	) {
		super();
		this.title = ctx.translate('moduleManagement');
		this.t = ctx.translate;
	}

	display() {
		const controlsEl = this.containerEl.createDiv('flex items-center gap-2 pb-4');
		const searchEl = controlsEl.createDiv('min-w-0 flex-1');
		const listEl = this.containerEl.createDiv('min-h-0 overflow-y-auto');
		const onQuery = hook<[string]>();
		const onShowInstalledOnlyChange = hook<[boolean]>();

		const search = new SearchComponent(searchEl)
			.setPlaceholder(this.t('searchModules'))
			.onChange(onQuery);
		search.inputEl.addClass('w-full');
		search.inputEl.spellcheck = false;

		const menuButton = controlsEl.createEl('button', 'clickable-icon flex-shrink-0 rounded-md');
		setIcon(menuButton, 'hard-drive-download');
		setTooltip(menuButton, this.t('showInstalledOnly'));
		const activeClasses = ['bg-[--interactive-accent]!', 'color-[--text-on-accent]!'];
		menuButton.onClickEvent(() => {
			this.showInstalledOnly = !this.showInstalledOnly;
			if (this.showInstalledOnly) menuButton.addClasses(activeClasses);
			else menuButton.removeClasses(activeClasses);
			onShowInstalledOnlyChange(this.showInstalledOnly);
		});

		this.cleanup.push(
			mountModuleManagementList(listEl, this.ctx, {
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
