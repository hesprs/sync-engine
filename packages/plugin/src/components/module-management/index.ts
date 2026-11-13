import App from './App';
import { render } from 'solid-js/web';
import type { AugmentedModuleMeta } from '@/modules/Extensibility';
import type { Fragment, Translate } from '@/modules/I18n';
import type { App as ObsidianApp } from 'obsidian';

export type PendingAction = 'delete' | 'disable' | 'download' | 'enable' | 'editInfo';

export type ModuleManagementTranslations = {
	disableModule: string;
	downloadModule: string;
	enableModule: string;
	installed: string;
	loadingModules: string;
	noInstalledModulesFound: string;
	noMatchingModulesFound: string;
	noModulesAvailable: string;
	updateAvailable: string;
	updateModule: string;
	deleteModule: string;
	editModuleInformation: string;
	official: string;
	someModulesHidden: string;
	openReadme: string;
	searchModules: string;
	moduleManagement: string;
	showInstalledOnly: string;
	installModuleFromFile: string;
	installModuleFromCode: string;
	moduleExtensionWarning: Fragment;
	refreshSources: string;
};

export type ModuleManagementContext = {
	installModule: (meta: AugmentedModuleMeta, module: string) => Promise<void>;
	fetchSources: (manual?: boolean) => Promise<Array<AugmentedModuleMeta>>;
	discoveredModules: Map<string, AugmentedModuleMeta>;
	loadedModules: Map<string, unknown>;
	downloadModule: (meta: AugmentedModuleMeta) => Promise<void>;
	deleteModule: (id: string) => Promise<void>;
	loadModule: (meta: AugmentedModuleMeta, start?: boolean) => Promise<void>;
	unloadModule: (id: string) => void;
	enableModule: (id: string) => Promise<void>;
	disableModule: (id: string) => void;
	translate: Translate<ModuleManagementTranslations>;
	updateModuleMeta: (meta: AugmentedModuleMeta) => Promise<void>;
	app: ObsidianApp;
	pluginOutdated: boolean;
};

export function mountModuleManagement(el: Element, ctx: ModuleManagementContext) {
	let isUnmounted = false;
	const unmount = render(() => App({ ctx, el, isUnmounted: () => isUnmounted }), el);
	return () => {
		isUnmounted = true;
		unmount();
	};
}
