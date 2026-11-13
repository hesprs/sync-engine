import '@/global.css';
import Bootstrap from '@/modules/Bootstrap';
import EventBus from '@/modules/EventBus';
import Extensibility, { OFFICIAL_SOURCE } from '@/modules/Extensibility';
import I18n from '@/modules/I18n';
import Observability from '@/modules/Observability';
import ProgressModal from '@/modules/ProgressModal';
import Registrar from '@/modules/Registrar';
import Scheduler from '@/modules/Scheduler';
import Setting from '@/modules/Setting';
import Storage from '@/modules/Storage';
import Sync from '@/modules/Sync';
import { NONE_STRATEGY } from '@repo/shared/glob-match';
import { Plugin } from 'obsidian';
import { createContext } from 'synthkernel';
import type { App, PluginManifest } from 'obsidian';
import type { Context as KernelContext, MergeSingleKey } from 'synthkernel';

const internalModules = [
	EventBus,
	I18n,
	Storage,
	Extensibility,
	Setting,
	Registrar,
	Sync,
	Observability,
	Scheduler,
	ProgressModal,
	Bootstrap,
] as const;

type InternalModules = typeof internalModules;
export type MergeKeys = 'settings' | 'root' | 'events' | 'i18n';
export type Context = KernelContext<
	InternalModules,
	MergeKeys,
	{
		app: App;
		addCommand: Plugin['addCommand'];
		removeCommand: Plugin['removeChild'];
		registerEvent: Plugin['registerEvent'];
		addRibbonIcon: Plugin['addRibbonIcon'];
		manifest: PluginManifest;
		addStatusBarItem: Plugin['addStatusBarItem'];
		registerView: Plugin['registerView'];
		registerHoverLinkSource: Plugin['registerHoverLinkSource'];
		registerExtensions: Plugin['registerExtensions'];
		registerMarkdownPostProcessor: Plugin['registerMarkdownPostProcessor'];
		registerMarkdownCodeBlockProcessor: Plugin['registerMarkdownCodeBlockProcessor'];
		registerBasesView: Plugin['registerBasesView'];
		registerEditorExtension: Plugin['registerEditorExtension'];
		registerEditorSuggest: Plugin['registerEditorSuggest'];
		registerObsidianProtocolHandler: Plugin['registerObsidianProtocolHandler'];
		registerCliHandler: Plugin['registerCliHandler'];
		registerDomEvent: Plugin['registerDomEvent'];
		saveSettings: () => Promise<void>;
	}
>;
export type Events = MergeSingleKey<InternalModules, 'events'>;
export type Settings = MergeSingleKey<InternalModules, 'settings'>;
export type Translations = MergeSingleKey<InternalModules, 'i18n'>;

// TODO after December 15, 2026:
// 1. Bump min Obsidian version to 1.15
// 2. Remove the file chunking hack in packages/plugin/src/fs/vault/request.ts (Obsidian 1.15+ uses Capacitor 7)
// 3. Remove "Connect account" / "Account connected" setting title hack in Google Drive / Dropbox module (Obsidian 1.14+ supports `id` for deduplication)

export default class SyncEngine extends Plugin {
	context?: Context;
	readonly allModules = new Set(internalModules);
	declare settings: Settings;

	async onload() {
		const settings: Settings = {
			asymmetricStorage: false,
			avoidAutoSyncWhenOffline: true,
			confirmDeleteInAutoSync: true,
			confirmTasksInSync: true,
			conflictResolver: 'renameAndKeepBoth',
			customHeaders: [],
			exportLogsDirectory: 'Sync Engine Logs/',
			focusSync: { enabled: false, value: 300_000 },
			maxFileSize: { enabled: false, value: 31_457_280 },
			maxMemoryConsumption: { enabled: false, value: 64 * 1024 ** 2 },
			maxRequestConcurrency: { enabled: true, value: 50 },
			minRequestInterval: { enabled: false, value: 0 },
			moduleAutoUpdate: true,
			moduleSources: [OFFICIAL_SOURCE],
			modules: {},
			noticeStatusOnMobile: true,
			realtimeSync: { enabled: false, value: 5000 },
			realtimeSyncFastMode: true,
			remoteFs: '',
			scheduledSync: { enabled: false, value: 300_000 },
			startupSync: { enabled: false, value: 5000 },
			syncStrategy: [
				{ expr: '*', strategy: 'bidirectional' },
				...[
					'node_modules',
					'.DS_Store',
					'__MACOSX',
					'desktop.ini',
					'Thumbs.db',
					'~$*.{doc,docx,ppt,pptx,xls,xlsx}',
					'.git',
					'.github',
					'.gitlab',
					'.trash',
					this.app.vault.configDir,
					`${this.manifest.dir}/modules`,
				].map((expr) => ({ expr, strategy: NONE_STRATEGY })),
			],
			...((await this.loadData()) as object),
		};

		// https://github.com/microsoft/TypeScript/issues/62995
		const preMerge = {
			addCommand: this.addCommand.bind(this),
			addRibbonIcon: this.addRibbonIcon.bind(this),
			addStatusBarItem: this.addStatusBarItem.bind(this),
			allModules: this.allModules,
			app: this.app,
			manifest: this.manifest,
			registerBasesView: this.registerBasesView.bind(this),
			registerCliHandler: this.registerCliHandler.bind(this),
			registerDomEvent: this.registerDomEvent.bind(this),
			registerEditorExtension: this.registerEditorExtension.bind(this),
			registerEditorSuggest: this.registerEditorSuggest.bind(this),
			registerEvent: this.registerEvent.bind(this),
			registerExtensions: this.registerExtensions.bind(this),
			registerHoverLinkSource: this.registerHoverLinkSource.bind(this),
			registerMarkdownCodeBlockProcessor: this.registerMarkdownCodeBlockProcessor.bind(this),
			registerMarkdownPostProcessor: this.registerMarkdownPostProcessor.bind(this),
			registerObsidianProtocolHandler: this.registerObsidianProtocolHandler.bind(this),
			registerView: this.registerView.bind(this),
			removeCommand: this.removeCommand.bind(this),
			saveSettings: this.saveSettings.bind(this),
		};
		this.context = createContext(internalModules, {
			injectKeys: ['settings', 'i18n', 'root'],
			mergeKeys: ['settings', 'root', 'events', 'i18n'],
			preMerge,
		}).__assign__({ settings });
		this.settings = this.context.settings;
		await this.context.loadAllModules();
		for (const module of this.allModules) {
			const instance = this.context.__getModule__(module);
			if ('start' in instance) instance.start();
		}
		this.context.addSettingTab(this);
	}

	onunload() {
		if (!this.context) return;
		for (const module of [...this.allModules].reverse()) {
			const instance = this.context.__getModule__(module);
			if ('dispose' in instance) instance.dispose();
		}
		this.context = undefined;
	}

	readonly saveSettings = () => this.saveData(this.settings);
}
