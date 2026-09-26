import '@/global.css';
import type { Command, EventRef, App } from 'obsidian';
import type { Context as KernelContext, MergeSingleKey } from 'synthkernel';
import { Plugin } from 'obsidian';
import { createContext } from 'synthkernel';
import type { AddRibbonIcon } from '@/modules/Observability';
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
import { NONE_STRATEGY } from './utils/glob-match';

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
		addCommand: (command: Command) => Command;
		registerEvent: (ref: EventRef) => void;
		addRibbonIcon: AddRibbonIcon;
		addStatusBarItem: () => HTMLElement;
		saveSettings: () => Promise<void>;
	}
>;
export type Events = MergeSingleKey<InternalModules, 'events'>;
export type Settings = MergeSingleKey<InternalModules, 'settings'>;
export type Translations = MergeSingleKey<InternalModules, 'i18n'>;

export default class SyncEngine extends Plugin {
	context?: Context;
	readonly allModules = new Set(internalModules);
	declare settings: Settings;

	async onload() {
		const settings: Settings = {
			asymmetricStorage: true,
			avoidAutoSyncWhenOffline: true,
			confirmDeleteInAutoSync: true,
			confirmTasksInSync: true,
			conflictResolver: 'renameAndKeepBoth',
			customHeaders: [],
			exportLogsDirectory: 'Sync Engine Logs/',
			maxFileSize: { enabled: false, value: 31_457_280 },
			maxMemoryConsumption: { enabled: true, value: 100 * 1024 ** 2 },
			maxRequestConcurrency: { enabled: true, value: 50 },
			minRequestInterval: { enabled: false, value: 0 },
			moduleAutoUpdate: true,
			moduleSources: [OFFICIAL_SOURCE],
			modules: {},
			noticeStatusOnMobile: true,
			realtimeSync: { enabled: false, value: 5000 },
			realtimeSyncFastMode: true,
			remoteFs: '',
			scheduledSync: { enabled: false, value: 15 * 60 * 1000 },
			startupSync: { enabled: false, value: 5000 },
			syncStrategy: [
				{ expr: '*', strategy: 'bidirectional' },
				...[
					'node_modules',
					'.DS_Store',
					'__MACOSX',
					'desktop.ini',
					'Thumbs.db',
					'~$*.doc',
					'~$*.docx',
					'~$*.ppt',
					'~$*.pptx',
					'~$*.xls',
					'~$*.xlsx',
					'.git',
					'.github',
					'.gitlab',
					'.trash',
					this.app.vault.configDir,
					`${this.app.vault.configDir}/plugins/sync-engine/modules`,
				].map((expr) => ({ expr, strategy: NONE_STRATEGY })),
			],
			...((await this.loadData()) as Record<string, unknown>),
		};

		migrateSettings(settings, this.saveSettings);

		// https://github.com/microsoft/TypeScript/issues/62995
		const preMerge = {
			addCommand: this.addCommand.bind(this),
			addRibbonIcon: this.addRibbonIcon.bind(this),
			addStatusBarItem: this.addStatusBarItem.bind(this),
			allModules: this.allModules,
			app: this.app,
			registerEvent: this.registerEvent.bind(this),
			saveSettings: this.saveSettings,
		};
		this.context = createContext(internalModules, {
			injectKeys: ['settings', 'i18n'],
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

// TODO: remove after November 1, 2026
type LegacySetting = {
	inclusionRules?: Array<{ expr: string }>;
	exclusionRules?: Array<{ expr: string }>;
	decider?: string;
};
function migrateSettings(setting: Settings, save: () => Promise<void>) {
	const legacy = setting as unknown as LegacySetting;
	const { inclusionRules, exclusionRules, decider } = legacy;
	if (!inclusionRules || !exclusionRules || !decider) return;
	setting.syncStrategy = [
		{ expr: '*', strategy: decider },
		...exclusionRules.map(({ expr }) => ({ expr, strategy: NONE_STRATEGY })),
		...inclusionRules.map(({ expr }) => ({ expr, strategy: decider })),
	];
	delete legacy.exclusionRules;
	delete legacy.inclusionRules;
	delete legacy.decider;
	void save();
}
