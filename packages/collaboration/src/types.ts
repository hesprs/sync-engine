import type { CollaborationTranslations } from '@/i18n';
import type {
	ConflictResolver,
	DeciderEntry,
	Dispatch,
	Events,
	ExistingMemoryDB,
	FsWrapperEntry,
	ModuleStatus,
	ObsidianLanguageCode,
	On,
	SelectFromContext,
	SettingEntry,
	SyncTerminateReason,
	Translate,
	TranslationResource,
	TriggerEntry,
} from '@hesprs/sync-engine-sdk';
import type { App } from 'obsidian';

export type GlobStrategy = { expr: string; strategy: string };
export type TogglableValue<T = number> = { enabled: boolean; value: T };

export type CollaborationContext = SelectFromContext<{
	app: App;
	deciderRegistry: Map<string, DeciderEntry>;
	dispatch: Dispatch<Events>;
	getConflictResolver: () => ConflictResolver;
	memoryDB: ExistingMemoryDB;
	on: On<Events>;
	refreshSettingTab: () => void;
	registerDecider: (id: string, entry: DeciderEntry) => () => boolean;
	registerI18n: (locale: ObsidianLanguageCode, resource: TranslationResource) => void;
	registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => boolean;
	registerSetting: (entry: SettingEntry) => () => boolean;
	registerTrigger: (key: string, entry: TriggerEntry) => () => boolean;
	requestSync: (trigger: string) => Promise<SyncTerminateReason>;
	rerenderSettingTab: () => void;
	saveSettings: () => Promise<void>;
	setModuleStatus: (id: string, status?: ModuleStatus) => () => void;
	settings: {
		confirmDeleteInAutoSync?: boolean;
		realtimeSync?: TogglableValue;
		realtimeSyncFastMode?: boolean;
		syncStrategy: Array<GlobStrategy>;
	};
	translate: Translate<CollaborationTranslations>;
}>;
