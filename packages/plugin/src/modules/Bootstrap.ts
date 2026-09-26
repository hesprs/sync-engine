import type { Events, Translations } from '@';
import type { App, SecretStorage } from 'obsidian';
import type { Ref } from 'synthkernel';
import type { DatabaseSync } from 'uni-kv';
import type { FileTreeTranslations } from '@/components/file-tree';
import type { UntrustedModuleTranslations } from '@/components/UntrustedModuleModal';
import type { BatchOptimizer, Fs, MemoryControlSharedState } from '@/fs';
import type { ControlsSettingTranslations } from '@/settings/controls';
import type { DevelopmentSettingTranslations } from '@/settings/development';
import type { FeaturesSettingTranslations } from '@/settings/features';
import type { HeadSettingTranslations } from '@/settings/head';
import type { MiscellaneousSettingTranslations } from '@/settings/miscellaneous';
import type { ModulesTranslations } from '@/settings/module-management';
import type { Stat, TogglableValue } from '@/types';
import en from '@/en';
import {
	rateLimiterMiddleware,
	cancellationWrapper,
	optimizationWrapper,
	contextWrapper,
	memoryControlWrapper,
	retryMiddleware,
	hierarchicalOptimizer,
	asymmetricStorageWrapper,
	customHeadersMiddleware,
	cancellationMiddleware,
	optimizationCompanionWrapper,
} from '@/fs';
import {
	bidirectionalDecider,
	mirrorLocalDecider,
	mirrorRemoteDecider,
	keepLocalResolver,
	keepRemoteResolver,
	latestSurviveResolver,
	renameAndKeepBothResolver,
} from '@/sync';
import type { Dispatch, On } from './EventBus';
import type { ObsidianLanguageCode, Translate, TranslationResource } from './I18n';
import type {
	ConflictResolverEntry,
	DeciderEntry,
	RemoteFsEntry,
	OptimizerEntry,
	FsWrapperEntry,
	RemoteRequestMiddlewareEntry,
	LocalRequestMiddlewareEntry,
	TriggerEntry,
} from './Registrar';

export type CustomHeaders = Array<{ type: 'plaintext' | 'secret'; value: string; key: string }>;
export type ExistingMemoryDB = DatabaseSync<
	{ localContext20000: Stat; remoteContext10000: Stat; remoteContext20000: Stat },
	{
		localContext20000Marker: string;
		remoteContext10000Marker?: string;
		remoteContext20000Marker: string;
	}
>;

const MAX_VAULT_CONCURRENCY = 200;

export default class Bootstrap {
	private readonly cleanupCallbacks: Array<() => void> = [];

	// MemoryControlWrapper
	private readonly memoryStates: Omit<MemoryControlSharedState, 'maxMemory'> = {
		hangingOperations: [],
		memoryConsumption: 0,
	};
	// CancellationWrapper
	private isCancelled?: Ref<boolean>;
	// OptimizationWrapper
	private readonly localPool = new Set<string>();
	private readonly remotePool = new Set<string>();
	private localFs?: Fs;
	private remoteFs?: Fs;

	declare readonly i18n: {
		bidirectional: string;
		mirrorLocal: string;
		mirrorRemote: string;
		latestSurvive: string;
		keepLocal: string;
		keepRemote: string;
		renameAndKeepBoth: string;
		skip: string;
	} & ControlsSettingTranslations &
		DevelopmentSettingTranslations &
		FeaturesSettingTranslations &
		HeadSettingTranslations &
		MiscellaneousSettingTranslations &
		UntrustedModuleTranslations &
		FileTreeTranslations &
		ModulesTranslations;
	declare readonly settings: {
		maxMemoryConsumption: TogglableValue;
		maxRequestConcurrency: TogglableValue;
		minRequestInterval: TogglableValue;
		realtimeSyncFastMode: boolean;
		asymmetricStorage: boolean;
		customHeaders: CustomHeaders;
		confirmDeleteInAutoSync: boolean;
		confirmTasksInSync: boolean;
	};

	constructor(
		private readonly ctx: {
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
			registerTrigger: (key: string, entry: TriggerEntry) => () => boolean;
			registerConflictResolver: (id: string, entry: ConflictResolverEntry) => void;
			registerRemoteRequestMiddleware: (entry: RemoteRequestMiddlewareEntry) => void;
			registerLocalRequestMiddleware: (entry: LocalRequestMiddlewareEntry) => void;
		},
	) {
		ctx.registerI18n('en', en);
	}

	readonly start = () => {
		const {
			app: { secretStorage },
			registerLocalFsWrapper,
			registerRemoteFsWrapper,
			on,
			memoryDB,
			registerDecider,
			translate: t,
			registerLocalOptimizer,
			registerRemoteOptimizer,
			registerTrigger,
			registerConflictResolver,
			registerRemoteRequestMiddleware,
			registerLocalRequestMiddleware,
			dispatch,
			optimizeLocal,
			optimizeRemote,
		} = this.ctx;
		const { maxMemoryConsumption, maxRequestConcurrency, minRequestInterval } = this.settings;

		const getMaxMemory = () =>
			maxMemoryConsumption.enabled ? maxMemoryConsumption.value : Infinity;
		const getMaxConcurrency = () =>
			maxRequestConcurrency.enabled ? maxRequestConcurrency.value : Infinity;
		const getMinInterval = () => (minRequestInterval.enabled ? minRequestInterval.value : 0);
		const getDeletionConfirm = () => this.settings.confirmDeleteInAutoSync;
		const logger = (log: string) => dispatch('logSync', log);

		const context20000 = memoryDB.getStore('remoteContext20000');
		registerTrigger('realtime', {
			options: () => ({
				needConfirmDeletion: getDeletionConfirm(),
				remoteLister:
					this.settings.realtimeSyncFastMode && context20000.keys().length
						? ({ reporter }) => {
								const entries = context20000.values();
								const filtered: Array<Stat> = [];
								return Promise.all(
									entries.map(async (stat, index) => {
										if (
											(await reporter({
												completed: index + 1,
												current: stat.key,
												total: entries.length,
											})) === 'exclude'
										)
											return;
										filtered.push(stat);
									}),
								).then(() => filtered);
							}
						: undefined,
			}),
			priority: 1000,
		});
		registerTrigger('interval', {
			options: () => ({ needConfirmDeletion: getDeletionConfirm() }),
			priority: 2000,
		});
		registerTrigger('startup', {
			options: () => ({ needConfirmDeletion: getDeletionConfirm() }),
			priority: 3000,
		});
		registerTrigger('migration', {
			options: () => ({
				decider: mirrorLocalDecider,
				detectMoves: false,
				remoteLister: () => [], // Remote has already been cleared in phase 2
			}),
			priority: 3980,
		});
		registerTrigger('nonInteractiveManual', { priority: 3990 });
		registerTrigger('manual', {
			options: () => ({ needConfirmTasks: this.settings.confirmTasksInSync }),
			priority: 4000,
		});

		registerLocalOptimizer({ apply: hierarchicalOptimizer, priority: 10_000 });
		registerRemoteOptimizer({ apply: hierarchicalOptimizer, priority: 10_000 });
		registerLocalFsWrapper({
			apply: (fs) =>
				memoryControlWrapper(
					fs,
					Object.assign(this.memoryStates, { maxMemory: getMaxMemory() }),
				),
			priority: 1000,
		});
		registerLocalFsWrapper({
			apply: (fs) =>
				optimizationWrapper(fs, {
					batchOptimizer: optimizeLocal,
					thisPool: this.localPool,
				}),
			priority: 2000,
		});
		registerLocalFsWrapper({
			apply: (fs) => {
				if (this.isCancelled) return cancellationWrapper(fs, this.isCancelled);
			},
			priority: 3000,
		});
		registerLocalFsWrapper({
			apply: (fs) =>
				contextWrapper(fs, {
					db: memoryDB,
					marker: 'localContext20000Marker',
					store: 'localContext20000',
				}),
			priority: 20_000,
		});
		registerLocalFsWrapper({
			apply: (fs) =>
				optimizationCompanionWrapper(fs, {
					getThatFs: () => {
						if (!this.remoteFs)
							throw new Error(
								'RemoteFs not found for local optimization companion, this is probably a bug of Sync Engine.',
							);
						return this.remoteFs;
					},
					thatPool: this.remotePool,
				}),
			priority: 21_000,
		});

		registerRemoteFsWrapper({
			apply: (fs) =>
				memoryControlWrapper(
					fs,
					Object.assign(this.memoryStates, { maxMemory: getMaxMemory() }),
				),
			priority: 1000,
		});
		registerRemoteFsWrapper({
			apply: (fs) =>
				optimizationWrapper(fs, {
					batchOptimizer: optimizeRemote,
					thisPool: this.remotePool,
				}),
			priority: 2000,
		});
		registerRemoteFsWrapper({
			apply: (fs) => {
				if (this.isCancelled) return cancellationWrapper(fs, this.isCancelled);
			},
			priority: 3000,
		});
		registerRemoteFsWrapper({
			apply: (fs) => {
				if (this.settings.asymmetricStorage)
					return contextWrapper(fs, {
						db: memoryDB,
						marker: 'remoteContext10000Marker',
						store: 'remoteContext10000',
					});
			},
			priority: 10_000,
		});
		registerRemoteFsWrapper({
			apply: (fs) => {
				if (this.settings.asymmetricStorage)
					return asymmetricStorageWrapper(
						fs,
						memoryDB.getStore('remoteContext10000'),
						(str) => dispatch('logSync', str),
					);
			},
			priority: 11_000,
		});
		registerRemoteFsWrapper({
			apply: (fs) =>
				contextWrapper(fs, {
					db: memoryDB,
					marker: 'remoteContext20000Marker',
					store: 'remoteContext20000',
				}),
			priority: 20_000,
		});
		registerRemoteFsWrapper({
			apply: (fs) =>
				optimizationCompanionWrapper(fs, {
					getThatFs: () => {
						if (!this.localFs)
							throw new Error(
								'LocalFs not found for remote optimization companion, this is probably a bug of Sync Engine.',
							);
						return this.localFs;
					},
					thatPool: this.localPool,
				}),
			priority: 21_000,
		});

		registerRemoteRequestMiddleware({ apply: retryMiddleware, priority: 1000 });
		registerRemoteRequestMiddleware({
			apply: (request) =>
				rateLimiterMiddleware(request, {
					maxConcurrency: getMaxConcurrency(),
					minInterval: getMinInterval(),
				}),
			priority: 2000,
		});
		registerRemoteRequestMiddleware({
			apply: (fs) =>
				customHeadersMiddleware(
					fs,
					synthesizeHeaders(this.settings.customHeaders, secretStorage),
				),
			priority: 3000,
		});
		registerRemoteRequestMiddleware({
			apply: (request) => {
				if (this.isCancelled) return cancellationMiddleware(request, this.isCancelled);
			},
			priority: 4000,
		});

		registerLocalRequestMiddleware({
			apply: (request) =>
				rateLimiterMiddleware(request, {
					maxConcurrency: MAX_VAULT_CONCURRENCY,
					minInterval: 0,
				}),
			priority: 1000,
		});
		registerLocalRequestMiddleware({
			apply: (request) => {
				if (this.isCancelled) return cancellationMiddleware(request, this.isCancelled);
			},
			priority: 2000,
		});

		registerDecider('bidirectional', {
			decider: (input) => bidirectionalDecider(input, logger),
			prettyName: () => t('bidirectional'),
		});
		registerDecider('mirrorLocal', {
			decider: (input) => mirrorLocalDecider(input, logger),
			prettyName: () => t('mirrorLocal'),
		});
		registerDecider('mirrorRemote', {
			decider: (input) => mirrorRemoteDecider(input, logger),
			prettyName: () => t('mirrorRemote'),
		});

		registerConflictResolver('renameAndKeepBoth', {
			prettyName: () => t('renameAndKeepBoth'),
			resolver: renameAndKeepBothResolver,
		});
		registerConflictResolver('latestSurvive', {
			prettyName: () => t('latestSurvive'),
			resolver: latestSurviveResolver,
		});
		registerConflictResolver('keepLocal', {
			prettyName: () => t('keepLocal'),
			resolver: keepLocalResolver,
		});
		registerConflictResolver('keepRemote', {
			prettyName: () => t('keepRemote'),
			resolver: keepRemoteResolver,
		});
		registerConflictResolver('skip', {
			prettyName: () => t('skip'),
			resolver: () => {},
		});

		this.cleanupCallbacks.push(
			on('syncStarted', ({ isCancelled }) => (this.isCancelled = isCancelled)),
			on('syncInitialized', ({ localFs, remoteFs }) => {
				this.localFs = localFs;
				this.remoteFs = remoteFs;
			}),
			on('syncTerminated', () => {
				this.isCancelled = undefined;
				this.memoryStates.hangingOperations.length = 0;
				this.localFs = undefined;
				this.remoteFs = undefined;
				this.localPool.clear();
				this.remotePool.clear();
			}),
		);
	};

	readonly dispose = () => {
		this.cleanupCallbacks.splice(0).forEach((cb) => cb());
		this.memoryStates.hangingOperations.length = 0;
	};
}

function synthesizeHeaders(headers: CustomHeaders, secret: SecretStorage): Record<string, string> {
	return Object.fromEntries(
		headers.map(({ key, type, value }) => {
			if (type === 'plaintext') return [key, value];
			const secretValue = secret.getSecret(value);
			if (!secretValue) throw new Error(`Custom secret header not found: "${key}".`);
			return [key, secretValue];
		}),
	);
}
