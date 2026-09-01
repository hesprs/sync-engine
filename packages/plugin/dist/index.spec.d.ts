import { $ as RootFs, A as AddRecord, B as StoreOperations, C as RemoveRemote, D as MoveLocal, E as MoveRemote, F as RecordStore, G as Fs, H as BatchOptimizer, I as Storage, J as MkdirAtom, K as InputAtom, L as DatabaseAsync, M as ConflictResolver, N as ConflictResolverPayload, O as Download, P as TaskNames, Q as OutputAtom, R as DatabaseSync, S as ResolveConflict, T as RemoveLocal, U as CustomAtom, V as StoreSync, W as DeleteAtom, X as OptimizerInput, Y as MoveAtom, Z as OptimizerOutput, _ as CreateLocalDir, a as FsWrapperEntry, at as MaybePromise, b as TaskFactory, c as OptimizerEntry, ct as RecordStatsMap, d as RemoteLister, dt as TogglableValue, et as WrappedFs, f as RemoteListerEntry, ft as Binary, g as RequestResponse, h as RequestParam, i as DeciderEntry, it as GlobMatchRule, j as BaseTask, k as CreateRemoteDir, l as Registrar, lt as Stat, m as Request, n as CheckConnectionResult, nt as FileStat, o as Infras, ot as Progress, p as RemoteRequestMiddlewareEntry, pt as General$1, q as ListReporter, r as ConflictResolverEntry, rt as FolderStat, s as LocalRequestMiddlewareEntry, st as RecordStat, t as VaultRequest, tt as WriteAtom, u as RemoteFsEntry, ut as StatsMap, v as Decider, w as RemoveRecord, x as Upload, y as DeciderInput, z as StoreAsync } from "./index-g3mTMY1u.spec.js";
import { App, Command, EventRef, ExtraButtonComponent, IconName, Modal, Plugin, Setting, SettingDefinition, SettingDefinitionGroup, SettingDefinitionItem, SettingDefinitionList, SettingDefinitionPage, TextComponent, ToggleComponent } from "obsidian";
//#region ../../node_modules/.bun/synthkernel@.+synthkernel.tgz/node_modules/synthkernel/dist/context.d.ts
//#region src/context.d.ts
type General = any;
type GeneralConstructor = new (...args: Array<General>) => General;
type ModuleConstructor<C extends object> = new (context: C) => General;
type GeneralModuleInput = ReadonlyArray<GeneralConstructor> | ReadonlyArray<object>;
type IsPlainObject<T> = T extends object ? T extends Function | Date | RegExp | Array<any> | Map<any, any> | Set<any> ? false : true : false;
type ShallowMerge<A, B> = IsPlainObject<A> extends true ? (IsPlainObject<B> extends true ? Omit<A, keyof B> & B : B) : B;
type Keys<T> = T extends General ? keyof T : never;
type InstanceEach<T extends GeneralModuleInput> = T extends ReadonlyArray<GeneralConstructor> ? { [K in keyof T]: InstanceType<T[K]>; } : T;
type PickEach<T extends ReadonlyArray<object>, K extends PropertyKey> = { [I in keyof T]: Pick<T[I], Extract<K, keyof T[I]>>; };
type RootValue<T extends object> = RootKey extends keyof T ? Extract<T[RootKey], object> : {};
type MergeRootEach<T extends ReadonlyArray<object>> = { [I in keyof T]: ShallowMerge<Omit<T[I], RootKey>, RootValue<T[I]>>; };
type ExtractKeyEach<T extends ReadonlyArray<object>, K extends Keys<T>> = { [I in keyof T]: K extends keyof T[I] ? T[I][K] : never; };
type MergeObjects<T extends ReadonlyArray<object>, O extends ReadonlyArray<object> = MergeRootEach<T>> = { [P in Keys<O[number]>]: MergeValues<ExtractKeyEach<O, P>>; };
type MergeSingleKey<M extends GeneralModuleInput, K extends Keys<InstanceEach<M>[number]>> = MergeValues<ExtractKeyEach<InstanceEach<M>, K>>;
type MergePair<A, B> = [A] extends [never] ? B : [B] extends [never] ? A : ShallowMerge<A, B>;
type MergeValues<T extends ReadonlyArray<unknown>> = T extends readonly [infer First, ...infer Rest] ? [First] extends [never] ? MergeValues<Rest> : Rest extends ReadonlyArray<unknown> ? Rest['length'] extends 0 ? First : MergePair<First, MergeValues<Rest>> : never : never;
type MergeResult<M extends GeneralModuleInput, K extends Keys<InstanceEach<M>[number]>, Pr extends object, Po extends object> = MergeObjects<[Pr, ...PickEach<InstanceEach<M>, K>, Po]>;
type Context$1<M extends GeneralModuleInput, K extends Keys<InstanceEach<M>[number]>, Pr extends object = {}, Po extends object = {}> = MergeResult<M, K, Pr, Po> & {
  __modules__: WeakMap<M[number], InstanceEach<M>[number]>;
  __getModule__: <C extends new (ctx: General) => InstanceEach<M>[number]>(ctor: C) => InstanceType<C>;
  __addModule__: <N extends ModuleConstructor<Context$1<[...M, N], K, Pr, Po>>>(newModule: N) => Context$1<[...M, N], K, Pr, Po>;
  __assign__: (obj: Partial<MergeResult<M, K, Pr, Po>>) => Context$1<M, K, Pr, Po>;
};
declare const ROOT_KEY = "root";
type RootKey = typeof ROOT_KEY;
//#endregion
//#region ../../node_modules/.bun/synthkernel@.+synthkernel.tgz/node_modules/synthkernel/dist/reactive.d.ts
//#region src/reactive.d.ts
type RefMatchingFunc<T> = (newValue: T, oldValue: T) => unknown;
type Ref<T> = {
  (): T;
  (newValue: T): void;
  subscribe(func: RefMatchingFunc<T>, options?: {
    immediate?: boolean;
  }): () => void;
  unsubscribe(func: RefMatchingFunc<T>): void;
  clear(): void;
};
//#endregion
//#region src/modules/EventBus.d.ts
type Dispatch<O extends object> = <K extends keyof O>(...[key, payload]: undefined extends O[K] ? [K] : [K, O[K]]) => void;
type On<O extends object> = <K extends keyof O>(key: K, callback: (payload: O[K]) => void) => () => void;
declare class EventBus {
  readonly events: {
    logSync: string;
    logGeneral: string;
    errorSync: string;
    errorGeneral: string;
  };
  private readonly cleanupCallbacks;
  private readonly isIdle;
  private readonly syncLogs;
  private readonly generalLogs;
  constructor();
  private readonly getThisSync;
  private readonly putSyncLog;
  private readonly putGeneralLog;
  private readonly subscribers;
  private readonly on;
  private readonly dispatch;
  private readonly getLogs;
  readonly dispose: () => void;
  readonly root: {
    dispatch: Dispatch<General$1>;
    getLogs: () => string;
    isIdle: Ref<boolean>;
    on: On<General$1>;
  };
}
//#endregion
//#region src/modules/I18n.d.ts
type ObsidianLanguageCode = 'en' | 'af' | 'am' | 'ar' | 'az' | 'be' | 'bg' | 'bn' | 'ca' | 'cs' | 'da' | 'de' | 'dv' | 'el' | 'en-GB' | 'eo' | 'es' | 'eu' | 'fa' | 'fi' | 'fr' | 'ga' | 'gl' | 'he' | 'hi' | 'hr' | 'hu' | 'id' | 'it' | 'ja' | 'ka' | 'kh' | 'kn' | 'ko' | 'ky' | 'la' | 'lt' | 'lv' | 'ml' | 'ms' | 'nan-TW' | 'ne' | 'nl' | 'nn' | 'no' | 'oc' | 'or' | 'pl' | 'pt' | 'pt-BR' | 'ro' | 'ru' | 'sa' | 'si' | 'sk' | 'sl' | 'sq' | 'sr' | 'sv' | 'sw' | 'ta' | 'te' | 'th' | 'tl' | 'tr' | 'tt' | 'uk' | 'ur' | 'uz' | 'vi' | 'zh' | 'zh-TW';
type Primitive = string | number | boolean | null | undefined;
type Fragment<A = undefined> = (frag: DocumentFragment, args: A) => void;
type TranslationResource = Record<string, string | Fragment<General$1>>;
type InterpolationValues = Record<string, Primitive>;
type TranslateParams<R extends Fragment<General$1> | string> = R extends Fragment<infer A> ? ([undefined] extends [A] ? [] : [A]) : [] | [InterpolationValues];
type Translate<O extends TranslationResource> = <K extends keyof O>(key: K, ...args: TranslateParams<O[K]>) => O[K] extends string ? string : DocumentFragment;
declare class I18n {
  private readonly targetLangs;
  readonly i18n: {};
  private readonly registerI18n;
  private readonly translate;
  root: {
    registerI18n: (code: ObsidianLanguageCode, resource: TranslationResource) => void;
    translate: Translate<General$1>;
  };
}
//#endregion
//#region src/modules/Sync.d.ts
type SyncTerminateReason = {
  result: 'cancelled';
} | {
  result: 'completed';
} | {
  result: 'failed';
  error: string;
} | {
  result: 'noop';
};
type TaskInfo = {
  name: TaskNames;
  key: string;
  prettyName: string;
  isDir: boolean;
};
type FailedTaskInfo = TaskInfo & {
  error: string;
};
declare class Sync {
  private readonly ctx;
  dispatch: Dispatch<Events>;
  on: On<Events>;
  constructor(ctx: {
    dispatch: Dispatch<Events>;
    initializeSync: () => Infras;
    getDecider: () => Decider;
    on: On<Events>;
    translate: Translate<Translations>;
    listRemote: RemoteLister;
    getConflictResolver: () => ConflictResolver;
  });
  readonly events: {
    syncStarted: {
      isCancelled: Ref<boolean>;
      trigger: string;
    };
    remoteWalkProgress: Progress;
    syncTerminated: SyncTerminateReason;
    requestConfirmDelete: Array<RemoveLocal>;
    requestConfirmTasks: Array<BaseTask>;
    syncCanceled: undefined;
    taskCompleted: TaskInfo;
    taskFailed: FailedTaskInfo;
    executionStarted: Array<BaseTask>;
  };
  readonly settings: {
    maxFileSize: TogglableValue;
    exclusionRules: Array<GlobMatchRule>;
    inclusionRules: Array<GlobMatchRule>;
    confirmDeleteInAutoSync: boolean;
    confirmTasksInSync: boolean;
  };
  private readonly postProcess;
  private readonly confirmTasks;
  private readonly confirmDeletion;
  private readonly executeSync;
  private readonly convertDeleteToUpload;
  root: {
    executeSync: (trigger: string) => Promise<{
      result: "cancelled";
    } | {
      result: "completed";
    } | {
      result: "failed";
      error: string;
    } | {
      result: "noop";
    }>;
  };
}
//#endregion
//#region src/modules/Observability.d.ts
type SyncStage = 'none' | 'walkingRemote' | 'awaitingConfirmation' | 'executing' | 'completed' | 'completedNoop' | 'cancelled' | 'failed';
type AddRibbonIcon = (icon: IconName, title: string, callback: (evt: MouseEvent) => void) => HTMLElement;
declare class Observability {
  private readonly ctx;
  private lastSyncTime;
  private readonly sinceLastSyncText;
  private readonly syncStage;
  private readonly walkProgress;
  private readonly executionProgress;
  private readonly cleanupCallbacks;
  private readonly t;
  private readonly progressText;
  readonly settings: {
    noticeStatusOnMobile: boolean;
    exportLogsDirectory: string;
  };
  readonly i18n: {
    startSync: string;
    startNonInteractiveSync: string;
    stopSync: string;
    showProgress: string;
    exportLogsToFile: string;
    exportLogsFailed: string;
    idle: string;
  };
  constructor(ctx: {
    addStatusBarItem: () => HTMLElement;
    on: On<Events>;
    translate: Translate<Translations>;
    isIdle: Ref<boolean>;
    dispatch: Dispatch<Events>;
    requestSync: (trigger: string) => Promise<SyncTerminateReason>;
    showProgress: () => void;
    addCommand: (command: Command) => Command;
    addRibbonIcon: AddRibbonIcon;
    getLogs: () => string;
    app: App;
  });
  readonly start: () => void;
  private readonly setupStatus;
  private readonly setupCommands;
  private readonly exportLogs;
  readonly dispose: () => void;
  root: {
    executionProgress: Ref<Progress<TaskInfo>>;
    exportLogs: () => Promise<void>;
    syncStage: Ref<SyncStage>;
    walkProgress: Ref<Progress>;
  };
}
//#endregion
//#region src/components/file-tree/index.d.ts
type FileTreeTranslations = {
  selectAll: string;
  xSelected: string;
};
//#endregion
//#region src/modules/Extensibility.d.ts
type ModuleInstance = {
  moduleSettings: object;
  dispose?: () => void;
  start?: () => void;
};
type ModuleCtor = new (ctx: object) => ModuleInstance;
type ModuleMeta = {
  id: string;
  name: string;
  version: string;
  description: string;
  main: string;
  icon?: string;
  minPluginVersion?: string;
  readme?: string;
  integrity: string;
};
type AugmentedModuleMeta = ModuleMeta & {
  enabled: boolean;
  source: string;
  icon: string;
};
declare class Extensibility {
  private readonly ctx;
  private readonly moduleDir;
  private readonly sourceCache;
  private readonly discoveredModules;
  private readonly loadedModules;
  private readonly moduleStore;
  private autoUpdateTimeout?;
  readonly settings: {
    moduleSources: Array<string>;
    moduleAutoUpdate: boolean;
    modules: Record<string, object>;
  };
  readonly i18n: {
    failedToLoadModule: string;
    failedToDownloadModule: string;
    failedToFetchSource: string;
  };
  readonly events: {
    moduleLoaded: string;
    moduleUnloaded: string;
  };
  constructor(ctx: {
    app: App;
    __addModule__: Context['__addModule__'];
    __getModule__: Context['__getModule__'];
    dispatch: Dispatch<Events>;
    translate: Translate<Translations>;
    allModules: Set<General$1>;
    isIdle: Ref<boolean>;
    saveSettings: () => Promise<void>;
    indexedDB: DatabaseAsync<Record<string, AugmentedModuleMeta>>;
  });
  readonly start: () => void;
  private readonly createOperationFactory;
  private readonly loadAllModules;
  private readonly loadModule;
  private readonly unloadModule;
  private readonly installModule;
  private readonly downloadModule;
  private readonly deleteModule;
  private readonly fetchSources;
  private readonly updateModules;
  private readonly updateModuleMeta;
  private readonly enableModule;
  private readonly disableModule;
  private readonly getModulePath;
  private readonly parseModulePath;
  readonly dispose: () => void;
  readonly root: {
    deleteModule: (id: string) => Promise<void>;
    disableModule: (id: string) => void;
    discoveredModules: Map<string, AugmentedModuleMeta>;
    downloadModule: (meta: AugmentedModuleMeta, waitIdle?: boolean) => Promise<void>;
    enableModule: (id: string) => Promise<void>;
    fetchSources: (manual?: boolean) => Promise<AugmentedModuleMeta[]>;
    installModule: (meta: AugmentedModuleMeta, module: string) => Promise<void>;
    loadAllModules: () => Promise<void>;
    loadModule: (meta: AugmentedModuleMeta, start?: boolean, module?: string) => Promise<void>;
    loadedModules: Map<string, ModuleCtor>;
    pluginOutdated: boolean;
    unloadModule: (id: string) => void;
    updateModuleMeta: (meta: AugmentedModuleMeta) => Promise<void>;
    updateModules: () => Promise<void>;
  };
}
//#endregion
//#region src/components/UnknownModuleModal.d.ts
type FileInfo = {
  path: string;
  size: string;
  mtime: string;
  ctime: string;
  fileName: string;
};
type UnknownModuleTranslations = {
  unknownModule: string;
  unknownModuleDescription: Fragment<FileInfo>;
  delete: string;
  configure: string;
};
//#endregion
//#region src/modules/Setting.d.ts
type SettingTree = {
  (self: SettingTree): SettingDefinitionItem;
  [key: number]: SettingTree;
};
type NestedCallableTree = {
  (self: SettingTree): SettingDefinitionItem;
  [key: number]: CallableOrObjectTree;
};
type CallableOrObjectTree = NestedCallableTree | {
  [key: number]: CallableOrObjectTree;
};
type SettingEntry = {
  priority: number;
  apply: CallableOrObjectTree;
};
declare class Setting$1 {
  private readonly ctx;
  private readonly cleanupCallbacks;
  private settingTab?;
  private readonly settingRegistry;
  readonly i18n: {
    match: string;
    matchLabelDescription: string;
    speed: string;
    speedLabelDescription: string;
  };
  constructor(ctx: {
    on: On<Events>;
    translate: Translate<Translations>;
    registerSetting: (entry: SettingEntry) => () => boolean;
  });
  readonly start: () => void;
  private readonly matchLabel;
  private readonly speedLabel;
  private readonly addSettingTab;
  private readonly rerenderSettingTab;
  private readonly refreshSettingTab;
  root: {
    addSettingTab: (plugin: Plugin) => void;
    matchLabel: () => {
      text: string;
      tooltip: string;
    };
    refreshSettingTab: () => void | undefined;
    registerSetting: (entry: SettingEntry) => () => boolean;
    rerenderSettingTab: () => void | undefined;
    speedLabel: () => {
      color: string;
      text: string;
      textColor: string;
      tooltip: string;
    };
  };
  readonly dispose: () => void;
}
//#endregion
//#region src/settings/utils.d.ts
type EphemeralEditableItem<T> = {
  valid: boolean;
  new: boolean;
  value: T;
};
type EphemeralEditableListSchema = {
  ephemeralEditableLists: Array<EphemeralEditableItem<General$1>>;
};
type AugmentedSettingDefinitionItem<K extends string = string> = SettingDefinitionGroup<K> | SettingDefinitionList<K> | (SettingDefinitionPage<K> & {
  labels?: Array<LabelDefinition>;
}) | (SettingDefinition<K> & {
  labels?: Array<LabelDefinition>;
});
type LabelDefinition = {
  text: string;
  tooltip: string;
  color?: string;
  textColor?: string;
};
declare function s(parent: (self: SettingTree) => AugmentedSettingDefinitionItem, children?: CallableOrObjectTree): CallableOrObjectTree;
declare function reactivelyValidate<T>({ text, parse, onSave, format, immediate }: {
  text: TextComponent;
  parse: (value: string) => T | undefined;
  format?: (value: T) => string;
  onSave: (value: T) => void;
  immediate?: boolean;
}): void;
declare function generateEditableList<T>({ memoryDB, items, identifier, saveSettings, rerenderSettingTab, defaultValue, render, translations: { add, empty, heading }, extraButtons }: {
  memoryDB: DatabaseSync<EphemeralEditableListSchema>;
  items: Array<T>;
  identifier: string;
  saveSettings: () => Promise<void>;
  rerenderSettingTab: () => void;
  defaultValue: T;
  render: (setting: Setting, item: EphemeralEditableItem<T>, save: () => void) => void | (() => void);
  translations: {
    add: string;
    empty: string;
    heading?: string;
  };
  extraButtons?: Array<(button: ExtraButtonComponent, list: Array<EphemeralEditableItem<T>>, save: () => void) => void>;
}): SettingDefinitionList;
//#endregion
//#region src/settings/controls.d.ts
type ControlsSettingTranslations = {
  controls: string;
  maxFileSize: string;
  maxFileSizeDescription: string;
  maxFileSizePlaceholder: string;
  maxRequestConcurrency: string;
  minRequestInterval: string;
  minRequestIntervalDescription: string;
  minRequestIntervalPlaceholder: string;
  maxRequestConcurrencyPlaceholder: string;
  maxRequestConcurrencyDescription: string;
  maxMemoryConsumption: string;
  maxMemoryConsumptionDescription: string;
  maxMemoryConsumptionPlaceholder: string;
};
//#endregion
//#region src/settings/development.d.ts
type DevelopmentSettingTranslations = {
  development: string;
  clearRecords: string;
  recordsCleared: string;
  clear: string;
  clearRecordsDescription: string;
  export: string;
  exportLogsDescription: string;
  exportLogsDirectoryPlaceholder: string;
  exportLogsToFile: string;
  moduleSources: string;
  moduleSourcesDescription: string;
  edit: string;
  xConfigured: string;
  addSource: string;
  noSourceConfigured: string;
  moduleSourcePlaceholder: string;
};
//#endregion
//#region src/components/MigrationModal.d.ts
type MigrationModalTranslations = {
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
type MigrationEvents = {
  migrationProgress: Progress;
  migrationFailed: string;
};
type MigrationContext = {
  app: App;
  on: On<MigrationEvents>;
  dispatch: Dispatch<MigrationEvents & Events>;
  translate: Translate<MigrationModalTranslations>;
  requestSync: (trigger: string) => Promise<SyncTerminateReason>;
  initializeSync: () => Infras;
  memoryDB: ExistingMemoryDB;
};
declare function setNeedMigration(ctx: MigrationContext, { toggle, needMigration, content, apply }: {
  toggle: ToggleComponent;
  needMigration?: (value: boolean) => MaybePromise<boolean>;
  content: (value: boolean) => string | DocumentFragment;
  apply: (value: boolean) => MaybePromise<void>;
}): void;
//#endregion
//#region src/settings/features.d.ts
type FeaturesSettingTranslations = {
  features: string;
  realtimeSyncFastMode: string;
  realtimeSyncFastModeDescription: string;
  realtimeSync: string;
  realtimeSyncDescription: string;
  realtimeSyncPlaceholder: string;
  startupSync: string;
  startupSyncDescription: string;
  startupSyncPlaceholder: string;
  scheduledSync: string;
  scheduledSyncDescription: string;
  scheduledSyncPlaceholder: string;
  asymmetricStorage: string;
  asymmetricStorageDescription: Fragment;
  asymmetricStorageMigration: Fragment<'enable' | 'disable'>;
} & MigrationModalTranslations;
//#endregion
//#region src/settings/filter.d.ts
type FilterSettingTranslations = {
  filterRules: string;
  inclusionRules: string;
  inclusionRulesDescription: Fragment;
  exclusionRules: string;
  exclusionRulesDescription: Fragment;
  xConfigured: string;
  addInclusionRule: string;
  addExclusionRule: string;
  noRuleConfigured: string;
  filterPlaceholder: string;
  caseSensitive: string;
};
//#endregion
//#region src/settings/head.d.ts
type HeadSettingTranslations = {
  moduleAutoUpdate: string;
  moduleAutoUpdateDescription: string;
  moduleManagement: string;
  moduleManagementDescription: string;
  backend: string;
  backendDescription: string;
  syncStrategy: string;
  syncStrategyDescription: string;
  checkConnectionFailed: string;
  checkConnectionSuccess: string;
  checkConnection: string;
  conflictResolveStrategy: string;
  conflictResolveStrategyDescription: string;
  xEnabled: string;
  settingTips: Fragment<{
    labels: Array<LabelDefinition>;
    addLabel: typeof addLabel;
  }>;
};
declare function addLabel(element: Element, { text, tooltip, color, textColor }: LabelDefinition): HTMLSpanElement;
//#endregion
//#region src/settings/miscellaneous.d.ts
type MiscellaneousSettingTranslations = {
  miscellaneous: string;
  diffMatchPatch: string;
  keepLocal: string;
  keepRemote: string;
  skip: string;
  noticeStatusOnMobile: string;
  noticeStatusOnMobileDescription: string;
  confirmTasksInSync: string;
  confirmTasksInSyncDescription: string;
  confirmDeleteInAutoSync: string;
  confirmDeleteInAutoSyncDescription: string;
  customHeaders: string;
  customHeadersDescription: string;
  edit: string;
  xConfigured: string;
  addHeader: string;
  noHeaderConfigured: string;
  headerKeyPlaceholder: string;
  headerValuePlaceholder: string;
  addSecretHeader: string;
};
//#endregion
//#region src/components/module-management/index.d.ts
type ModuleManagementTranslations = {
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
};
//#endregion
//#region src/components/ModuleEditorModal.d.ts
type ModuleEditorTranslations = {
  editModuleInformation: string;
  enable: string;
  enableDescription: string;
  name: string;
  namePlaceholder: string;
  nameDescription: string;
  description: string;
  descriptionDescription: string;
  descriptionPlaceholder: string;
  icon: string;
  iconDescription: Fragment;
  iconPlaceholder: string;
  update: string;
  updateDescription: string;
  updatePlaceholder: string;
  integrityVerification: string;
  integrityVerificationDescription: Fragment;
  save: string;
  cancel: string;
  readmePage: string;
  readmePageDescription: string;
  readmePagePlaceholder: string;
};
//#endregion
//#region src/settings/module-management.d.ts
type ModulesTranslations = ModuleEditorTranslations & ModuleManagementTranslations & {
  searchModules: string;
  moduleManagement: string;
  showInstalledOnly: string;
  installModuleFromFile: string;
  moduleExtensionWarning: Fragment;
};
//#endregion
//#region src/modules/Bootstrap.d.ts
type CustomHeaders = Array<{
  type: 'plaintext' | 'secret';
  value: string;
  key: string;
}>;
type ExistingMemoryDB = DatabaseSync<{
  localContext20000: Stat;
  remoteContext10000: Stat;
  remoteContext20000: Stat;
}, {
  localContext20000Marker: string;
  remoteContext10000Marker: string;
  remoteContext20000Marker: string;
}>;
declare class Bootstrap {
  private readonly ctx;
  private readonly cleanupCallbacks;
  private readonly memoryStates;
  private isCancelled?;
  private readonly localPool;
  private readonly remotePool;
  private localFs?;
  private remoteFs?;
  readonly i18n: {
    bidirectional: string;
    mirrorLocal: string;
    mirrorRemote: string;
    latestSurvive: string;
    keepLocal: string;
    keepRemote: string;
    renameAndKeepBoth: string;
    skip: string;
  } & ControlsSettingTranslations & DevelopmentSettingTranslations & FeaturesSettingTranslations & FilterSettingTranslations & HeadSettingTranslations & MiscellaneousSettingTranslations & UnknownModuleTranslations & FileTreeTranslations & ModulesTranslations;
  readonly settings: {
    maxMemoryConsumption: TogglableValue;
    maxRequestConcurrency: TogglableValue;
    minRequestInterval: TogglableValue;
    realtimeSyncFastMode: boolean;
    asymmetricStorage: boolean;
    customHeaders: CustomHeaders;
  };
  constructor(ctx: {
    app: App;
    registerI18n: (code: ObsidianLanguageCode, resource: TranslationResource) => void;
    on: On<Events>;
    dispatch: Dispatch<Events>;
    memoryDB: ExistingMemoryDB;
    registerDecider: (id: string, entry: DeciderEntry) => void;
    registerLocalFsWrapper: (entry: FsWrapperEntry) => void;
    registerRemoteFs: (id: string, entry: RemoteFsEntry) => void;
    registerRemoteFsWrapper: (entry: FsWrapperEntry) => void;
    translate: Translate<Translations>;
    optimizeLocal: BatchOptimizer;
    optimizeRemote: BatchOptimizer;
    registerLocalOptimizer: (optimizer: OptimizerEntry) => void;
    registerRemoteOptimizer: (optimizer: OptimizerEntry) => void;
    registerRemoteLister: (entry: RemoteListerEntry) => () => boolean;
    registerConflictResolver: (id: string, entry: ConflictResolverEntry) => void;
    registerRemoteRequestMiddleware: (entry: RemoteRequestMiddlewareEntry) => void;
    registerLocalRequestMiddleware: (entry: LocalRequestMiddlewareEntry) => void;
  });
  readonly start: () => void;
  readonly dispose: () => void;
}
//#endregion
//#region src/modules/ProgressModal.d.ts
type DeleteConfirmReturn = {
  delete: Array<RemoveLocal>;
  reupload: Array<RemoveLocal>;
};
type TaskCounts = {
  total: number;
  deleteLocal: number;
  deleteRemote: number;
  conflict: number;
};
declare class ProgressModal extends Modal {
  private readonly ctx;
  private readonly moduleCleanupCallbacks;
  private readonly t;
  private opening;
  private readonly modalCleanupCallbacks;
  private readonly dispatch;
  private description?;
  private detailContainer?;
  private controls?;
  constructor(ctx: {
    app: App;
    translate: Translate<Translations>;
    on: On<Events>;
    dispatch: Dispatch<Events>;
    syncStage: Ref<SyncStage>;
    walkProgress: Ref<Progress>;
    executionProgress: Ref<Progress<TaskInfo>>;
  });
  readonly events: {
    tasksConfirmed: Array<BaseTask>;
    deleteConfirmed: DeleteConfirmReturn;
  };
  readonly i18n: {
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
  private readonly renderHideStop;
  private readonly renderConfirmCancel;
  private readonly renderDone;
  private readonly showDetails;
  private readonly hideDetails;
  onOpen(): void;
  root: {
    hideProgress: {
      (): void;
      (): void;
    };
    showProgress: () => void;
  };
  onClose(): void;
  dispose(): void;
}
//#endregion
//#region src/modules/Scheduler.d.ts
declare class Scheduler {
  private readonly ctx;
  private readonly pendingRequests;
  private isScheduling;
  private realtimeSyncTimer?;
  private scheduledSyncTimer?;
  private startupSyncTimer?;
  constructor(ctx: {
    syncStage: Ref<SyncStage>;
    executeSync: (trigger: string) => Promise<SyncTerminateReason>;
    registerEvent: (ref: EventRef) => void;
    app: App;
    isIdle: Ref<boolean>;
  });
  settings: {
    startupSync: TogglableValue;
    scheduledSync: TogglableValue;
    realtimeSync: TogglableValue;
    exclusionRules: Array<GlobMatchRule>;
    inclusionRules: Array<GlobMatchRule>;
  };
  private readonly requestSync;
  start: () => void;
  dispose: () => void;
  private readonly startScheduledSync;
  private readonly stopScheduledSync;
  private readonly onChange;
  private readonly scheduleFlush;
  private readonly flush;
  root: {
    requestSync: (trigger: string) => Promise<SyncTerminateReason>;
    startScheduledSync: () => void;
    stopScheduledSync: () => void;
  };
}
//#endregion
//#region src/index.d.ts
declare const internalModules: readonly [typeof EventBus, typeof I18n, typeof Storage, typeof Extensibility, typeof Setting$1, typeof Registrar, typeof Sync, typeof Observability, typeof Scheduler, typeof ProgressModal, typeof Bootstrap];
type InternalModules = typeof internalModules;
type MergeKeys = 'settings' | 'root' | 'events' | 'i18n';
type Context = Context$1<InternalModules, MergeKeys, {
  app: App;
  addCommand: (command: Command) => Command;
  registerEvent: (ref: EventRef) => void;
  addRibbonIcon: AddRibbonIcon;
  addStatusBarItem: () => HTMLElement;
  saveSettings: () => Promise<void>;
}>;
type Events = MergeSingleKey<InternalModules, 'events'>;
type Settings = MergeSingleKey<InternalModules, 'settings'>;
type Translations = MergeSingleKey<InternalModules, 'i18n'>;
//#endregion
//#region src/sdk/prefix.d.ts
declare function prefixWrapper(original: Fs, prefix: string): WrappedFs;
//#endregion
//#region src/utils/pipe.d.ts
declare function pipe({ from, to, stat, key }: {
  from: Fs;
  to: Fs;
  key: string;
  stat: FileStat;
}): Promise<string | undefined>;
declare function readWithSize(fs: Fs, key: string, stat: FileStat): Promise<Binary | ReadableStream<Binary> | undefined>;
declare function writeWithValue(fs: Fs, key: string, value: Binary | ReadableStream<Binary>, stat: FileStat): MaybePromise<string>;
//#endregion
//#region src/sdk/index.d.ts
declare function digOriginal(wrapped: Fs): RootFs;
type SelectFromContext<O extends object> = Context extends O ? O : never;
//#endregion
export { type AddRecord, type AugmentedModuleMeta, type BaseTask, type BatchOptimizer, type Binary, type CallableOrObjectTree, type CheckConnectionResult, type ConflictResolver, type ConflictResolverEntry, type ConflictResolverPayload, type Context, type CreateLocalDir, type CreateRemoteDir, type CustomAtom, type DatabaseAsync, type DatabaseSync, type Decider, type DeciderEntry, type DeciderInput, type DeleteAtom, type Dispatch, type Download, type Events, type ExistingMemoryDB, type FileStat, type FolderStat, type Fragment, type Fs, type FsWrapperEntry, type InputAtom, type LabelDefinition, type ListReporter, type LocalRequestMiddlewareEntry, type MaybePromise, type MkdirAtom, type ModuleMeta, type MoveAtom, type MoveLocal, type MoveRemote, type ObsidianLanguageCode, type On, type OptimizerEntry, type OptimizerInput, type OptimizerOutput, type OutputAtom, type Progress, type RecordStat, type RecordStatsMap, type RecordStore, type RemoteFsEntry, type RemoteLister, type RemoteListerEntry, type RemoteRequestMiddlewareEntry, type RemoveLocal, type RemoveRecord, type RemoveRemote, type Request, type RequestParam, type RequestResponse, type ResolveConflict, type RootFs, SelectFromContext, type SettingEntry, type Settings, type Stat, type StatsMap, type StoreAsync, type StoreOperations, type StoreSync, type SyncTerminateReason, type TaskFactory, type TaskNames, type Translate, type TranslationResource, type Translations, type Upload, type VaultRequest, type WrappedFs, type WriteAtom, digOriginal, generateEditableList, pipe, prefixWrapper, reactivelyValidate, readWithSize, s, setNeedMigration, writeWithValue };