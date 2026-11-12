import { createHistoryCipher } from '@/crypto';
import { FlushScheduler, reconcile } from '@/flush';
import { compact } from '@/gc';
import { en, ru, zh, zhTW } from '@/i18n';
import { allCommitLocations } from '@/index-store';
import HistoryModal, { RecoverDeletedModal } from '@/modal';
import { openRemoteHistory } from '@/remote';
import { listVersions, restoreVersion } from '@/restore';
import historySetting from '@/setting';
import { getOrCreateDeviceId, openHistoryStores, readLastGcTime, saveLastGcTime } from '@/store';
import { ingestDeletion, ingestEdit } from '@/wal';
import { NONE_STRATEGY, prepareGlobMatch } from '@repo/shared/glob-match';
import { sha256Bytes } from '@repo/shared/sha256-bytes';
import { Notice, TFile } from 'obsidian';
import type { HistoryCipher } from '@/crypto';
import type { HistoryTranslations } from '@/i18n';
import type { RemoteHistory } from '@/remote';
import type { HistorySettings } from '@/setting';
import type { HistoryDatabase, HistoryStores } from '@/store';
import type {
	Context,
	Events,
	Fs,
	ObsidianLanguageCode,
	On,
	SelectFromContext,
	SettingEntry,
	SyncTerminateReason,
	Translate,
	TranslationResource,
} from '@hesprs/sync-engine-sdk';
import type { GlobStrategy } from '@repo/shared/glob-match';
import type { App, Command, EventRef, Menu, TAbstractFile } from 'obsidian';

const DEBOUNCE_MS = 15_000;
const MAX_WAIT_MS = 60_000;
const DAY_MS = 86_400_000;

const SUPPORTED_EXTS = ['.md', '.canvas', '.txt', '.json'];
const isSupportedHistoryFile = (path: string) =>
	SUPPORTED_EXTS.some((ext) => path.toLowerCase().endsWith(ext));
const isRemoteWriteTask = (name: string) =>
	name === 'download' ||
	name === 'resolveConflict' ||
	name === 'moveLocal' ||
	name === 'removeLocal';

type HistoryContext = SelectFromContext<{
	addCommand: (command: Command) => Command;
	app: App;
	getNamespace: Context['getNamespace'];
	indexedDB: HistoryDatabase;
	on: On<Events>;
	registerEvent: (ref: EventRef) => void;
	registerI18n: (locale: ObsidianLanguageCode, resource: TranslationResource) => void;
	registerSetting: (entry: SettingEntry) => () => boolean;
	requestSync: (trigger: string) => Promise<SyncTerminateReason>;
	saveSettings: () => Promise<void>;
	settings: { modules: Record<string, object>; syncStrategy?: Array<GlobStrategy> };
	translate: Translate<HistoryTranslations>;
}>;

type PendingDebounce = {
	data: Uint8Array;
	firstScheduledAt: number;
	timer: ReturnType<typeof setTimeout>;
};

export default class HistoryModule {
	private readonly cleanup: Array<() => void> = [];
	private readonly pendingDebounces = new Map<string, PendingDebounce>();
	private readonly lastIngestedHash = new Map<string, string>();
	private readonly syncWrittenFiles = new Set<string>();
	private commitQueue = Promise.resolve();
	private cachedRulesKey = '';
	private compiledMatcher?: (path: string) => { strategy: string };
	private stores?: HistoryStores;
	private storesNamespace?: string;
	private remote?: RemoteHistory;
	private remoteFsUid?: string;
	private scheduler?: FlushScheduler;
	private cipher?: HistoryCipher;
	private deviceId = '';

	moduleSettings: HistorySettings = { autoGc: true, maxVersions: 100, retentionDays: 90 };

	constructor(private readonly ctx: HistoryContext) {
		ctx.registerI18n('en', en);
		ctx.registerI18n('zh', zh);
		ctx.registerI18n('zh-TW', zhTW);
		ctx.registerI18n('ru', ru);
	}

	readonly start = () => {
		const { ctx } = this;
		// No namespace yet means no backend: defer opening stores to syncInitialized so no empty-id store is created.
		const namespace = namespaceOf(ctx);
		if (namespace !== undefined) this.openStores(namespace);
		ctx.registerEvent(ctx.app.vault.on('create', this.onVaultCreate));
		ctx.registerEvent(ctx.app.vault.on('modify', this.onVaultModify));
		ctx.registerEvent(ctx.app.vault.on('delete', this.onVaultDelete));
		ctx.registerEvent(ctx.app.vault.on('rename', this.onVaultRename));
		ctx.registerEvent(ctx.app.workspace.on('file-menu', this.onFileMenu));
		ctx.addCommand({
			callback: () => void this.openRecoverDeletedModal().catch(() => {}),
			id: 'history-recover-deleted',
			name: ctx.translate('recoverDeleted'),
		});
		this.cleanup.push(
			ctx.on('syncStarted', () => {
				this.syncWrittenFiles.clear();
				void this.flushPendingDebounces();
			}),
			ctx.on('executionStarted', (tasks) => {
				this.syncWrittenFiles.clear();
				for (const task of tasks)
					if (!task.local?.isDir && isRemoteWriteTask(task.name))
						this.syncWrittenFiles.add(task.key);
			}),
			ctx.on('syncInitialized', ({ remoteFs }) => {
				void this.initializeRemote(remoteFs);
			}),
			ctx.on('syncTerminated', () => {
				const hadRemoteWrites = this.syncWrittenFiles.size > 0;
				this.syncWrittenFiles.clear();
				if (hadRemoteWrites && this.remote && this.stores)
					void reconcile({
						remote: this.remote,
						requestSync: () => {},
						stores: this.stores,
					}).catch(() => {});

				void this.checkAutoGc();
			}),
			ctx.registerSetting({
				apply: historySetting(
					{ saveSettings: ctx.saveSettings, translate: ctx.translate },
					this.moduleSettings,
					{ runGc: async () => this.runGc() },
				),
				priority: 3055,
			}),
		);
		const onVisibility = () => {
			if (document.visibilityState === 'hidden')
				void this.flushPendingDebounces().then(() => this.scheduler?.onUnload());
		};
		if (typeof window !== 'undefined') {
			window.addEventListener('visibilitychange', onVisibility);
			const onBeforeUnload = () => void this.flushPendingDebounces();
			window.addEventListener('beforeunload', onBeforeUnload);
			this.cleanup.push(() => {
				window.removeEventListener('visibilitychange', onVisibility);
				window.removeEventListener('beforeunload', onBeforeUnload);
			});
		}
	};

	/** Opens stores for a namespace once and migrates legacy settings into them. */
	private openStores(namespace: string): HistoryStores {
		if (this.stores && this.storesNamespace === namespace) return this.stores;
		const stores = openHistoryStores(this.ctx.indexedDB, namespace);
		this.stores = stores;
		this.storesNamespace = namespace;
		void getOrCreateDeviceId(stores, this.moduleSettings.deviceId).then((id) => {
			this.deviceId = id;
		});
		const { deviceId, lastGcTime } = this.moduleSettings;
		if (deviceId !== undefined || lastGcTime !== undefined) {
			delete this.moduleSettings.deviceId;
			delete this.moduleSettings.lastGcTime;
			if (lastGcTime) void saveLastGcTime(stores, lastGcTime);
			void this.ctx.saveSettings();
		}
		return stores;
	}

	/**
	 * Derives a content cipher when the encryption module is active, then opens the isolated
	 * history handle. If encryption is on but its password is missing we deliberately keep
	 * `this.remote` unset so no plaintext history can be written.
	 */
	private async initializeRemote(remoteFs: Fs): Promise<void> {
		const fsUid = remoteFs.getUid();
		if (this.remote && this.remoteFsUid === fsUid) return;
		const { ctx } = this;
		const namespace = ctx.getNamespace(undefined, remoteFs);
		const stores = this.openStores(namespace);
		let cipher: HistoryCipher | undefined;
		try {
			cipher = await createHistoryCipher(ctx.settings.modules, ctx.app);
		} catch (error) {
			new Notice(`History encryption: ${String(error)}`);
			return;
		}
		this.cipher = cipher;
		const deviceId =
			this.deviceId || (await getOrCreateDeviceId(stores, this.moduleSettings.deviceId));
		this.deviceId = deviceId;
		const remote = openRemoteHistory(remoteFs, namespace, deviceId, cipher);
		if (!remote) return;
		this.remote = remote;
		this.remoteFsUid = fsUid;
		this.scheduler?.dispose();
		this.scheduler = new FlushScheduler({
			remote,
			requestSync: (trigger) => void ctx.requestSync(trigger),
			stores,
		});
		void reconcile({ remote, requestSync: () => {}, stores }).catch(() => {});
		void this.checkAutoGc();
	}

	private isIgnored(filePath: string): boolean {
		const syncStrategy = this.ctx.settings.syncStrategy;
		if (!syncStrategy || syncStrategy.length === 0) return false;
		const rulesKey = syncStrategy.map((rule) => `${rule.expr}:${rule.strategy}`).join('|');
		if (this.cachedRulesKey !== rulesKey || !this.compiledMatcher) {
			this.cachedRulesKey = rulesKey;
			this.compiledMatcher = prepareGlobMatch(syncStrategy);
		}
		return this.compiledMatcher(filePath).strategy === NONE_STRATEGY;
	}

	/** Adds a per-file "Show history" item to the file explorer context menu. */
	private readonly onFileMenu = (menu: Menu, file: TAbstractFile) => {
		if ('children' in file || !isSupportedHistoryFile(file.path) || this.isIgnored(file.path))
			return;
		menu.addItem((item) => {
			item.setTitle(this.ctx.translate('showHistory'))
				.setIcon('history')
				.onClick(() => void this.openHistoryForPath(file.path));
		});
	};

	private async openHistoryForPath(filePath: string): Promise<void> {
		if (!this.remote || !this.stores || this.isIgnored(filePath)) return;
		const ctx = { remote: this.remote, requestSync: () => {}, stores: this.stores };
		let versions;
		try {
			await this.flushPendingForPath(filePath);
			await this.scheduler?.trigger('openHistory');
			await reconcile(ctx);
			versions = await listVersions(ctx, filePath);
		} catch (error) {
			new Notice(text(this.ctx.translate('loadFailed', String(error))));
			return;
		}
		const existing = this.ctx.app.vault.getAbstractFileByPath(filePath);
		let currentText = '';
		if (existing instanceof TFile)
			try {
				currentText = await this.ctx.app.vault.read(existing);
			} catch {
				// Keep empty if read fails.
			}

		new HistoryModal(
			{ app: this.ctx.app, translate: this.ctx.translate },
			{ path: filePath },
			versions,
			{
				currentText,
				load: async (key, lamport) => {
					const result = await restoreVersion(ctx, { key, lamport });
					return result.text;
				},
				restore: async (content) => {
					const target = this.ctx.app.vault.getAbstractFileByPath(filePath);
					await (target instanceof TFile
						? this.ctx.app.vault.modify(target, content)
						: this.ctx.app.vault.create(filePath, content));
				},
			},
		).open();
	}

	private async openRecoverDeletedModal(): Promise<void> {
		if (!this.stores || !this.remote) return;
		await this.flushPendingDebounces();
		await reconcile({ remote: this.remote, requestSync: () => {}, stores: this.stores });
		const locations = await allCommitLocations(this.stores);
		const deletedKeys = [
			...new Set(
				locations
					.map(([key]) => key.split('@')[0])
					.filter(
						(key) =>
							!this.ctx.app.vault.getAbstractFileByPath(key) && !this.isIgnored(key),
					),
			),
		];
		new RecoverDeletedModal(
			{ app: this.ctx.app, translate: this.ctx.translate },
			deletedKeys,
			(key) => {
				void this.openHistoryForPath(key);
			},
		).open();
	}

	private commitEdit(key: string, data: Uint8Array, hash: string): Promise<void> {
		const next = this.commitQueue
			.then(async () => {
				if (!this.stores) return;
				this.lastIngestedHash.set(key, hash);
				await this.stores.hashes.set(key, hash);
				const entry = await ingestEdit(this.stores, key, data);
				this.scheduler?.onEdit(entry.text?.length ?? entry.newChunks?.length ?? 0);
			})
			.catch(() => {});
		this.commitQueue = next;
		return next;
	}

	private async flushPendingForPath(filePath: string): Promise<void> {
		if (!this.stores || this.isIgnored(filePath)) return;
		const pending = this.pendingDebounces.get(filePath);
		if (!pending) return;
		clearTimeout(pending.timer);
		this.pendingDebounces.delete(filePath);
		const hash = await sha256Bytes(pending.data);
		await this.commitEdit(filePath, pending.data, hash);
	}

	private async flushPendingDebounces(): Promise<void> {
		if (!this.stores || this.pendingDebounces.size === 0) return;
		const entries = [...this.pendingDebounces.entries()];
		this.pendingDebounces.clear();
		for (const [index, [key, pending]] of entries.entries()) {
			clearTimeout(pending.timer);
			if (this.isIgnored(key)) continue;
			const hash = await sha256Bytes(pending.data);
			void this.commitEdit(key, pending.data, hash);
			if ((index + 1) % 10 === 0)
				await new Promise<void>((resolve) => {
					setTimeout(resolve, 0);
				});
		}
		await this.commitQueue;
	}

	private queueIngest(filePath: string, content: string): void {
		if (!this.stores || this.isIgnored(filePath)) return;
		const data = new TextEncoder().encode(content);
		void sha256Bytes(data).then(async (hash) => {
			if (!this.stores) return;
			let lastHash = this.lastIngestedHash.get(filePath);
			if (lastHash === undefined) {
				lastHash = await this.stores.hashes.get(filePath);
				if (lastHash !== undefined) this.lastIngestedHash.set(filePath, lastHash);
			}
			if (lastHash === hash) return;
			const now = Date.now();
			const existing = this.pendingDebounces.get(filePath);
			if (existing) {
				clearTimeout(existing.timer);
				if (now - existing.firstScheduledAt >= MAX_WAIT_MS) {
					this.pendingDebounces.delete(filePath);
					void this.commitEdit(filePath, data, hash);
					return;
				}
				const timer = setTimeout(() => {
					this.pendingDebounces.delete(filePath);
					void this.commitEdit(filePath, data, hash);
				}, DEBOUNCE_MS);
				this.pendingDebounces.set(filePath, {
					data,
					firstScheduledAt: existing.firstScheduledAt,
					timer,
				});
			} else {
				const timer = setTimeout(() => {
					this.pendingDebounces.delete(filePath);
					void this.commitEdit(filePath, data, hash);
				}, DEBOUNCE_MS);
				this.pendingDebounces.set(filePath, { data, firstScheduledAt: now, timer });
			}
		});
	}

	private shouldIgnoreFile(file: TAbstractFile): boolean {
		if (
			!this.stores ||
			'children' in file ||
			!isSupportedHistoryFile(file.path) ||
			this.isIgnored(file.path) ||
			this.syncWrittenFiles.has(file.path)
		) {
			this.syncWrittenFiles.delete(file.path);
			return true;
		}
		return false;
	}

	private readonly onVaultCreate = (file: TAbstractFile) => {
		if (this.shouldIgnoreFile(file)) return;
		const filePath = file.path;
		void this.ctx.app.vault.read(file as TFile).then(
			(content) => {
				if (!this.stores || content.length === 0) return;
				this.queueIngest(filePath, content);
			},
			() => {},
		);
	};

	private readonly onVaultModify = (file: TAbstractFile) => {
		if (this.shouldIgnoreFile(file)) return;
		const filePath = file.path;
		void this.ctx.app.vault.read(file as TFile).then(
			(content) => {
				if (!this.stores) return;
				this.queueIngest(filePath, content);
			},
			() => {},
		);
	};

	private readonly onVaultDelete = (file: TAbstractFile) => {
		const { stores } = this;
		if (!stores || this.shouldIgnoreFile(file)) return;
		const filePath = file.path;
		const pending = this.pendingDebounces.get(filePath);
		if (pending) {
			clearTimeout(pending.timer);
			this.pendingDebounces.delete(filePath);
		}
		this.lastIngestedHash.delete(filePath);
		void stores.hashes.delete(filePath);
		void ingestDeletion(stores, filePath).then(() => {
			this.scheduler?.onEdit(0);
		});
	};

	private readonly onVaultRename = (file: TAbstractFile, oldPath: string) => {
		if (!this.stores || 'children' in file) return;
		if (this.syncWrittenFiles.has(file.path)) {
			this.syncWrittenFiles.delete(file.path);
			return;
		}
		const pendingOld = this.pendingDebounces.get(oldPath);
		if (pendingOld) {
			clearTimeout(pendingOld.timer);
			this.pendingDebounces.delete(oldPath);
		}
		this.lastIngestedHash.delete(oldPath);
		void this.stores.hashes.delete(oldPath);
		if (isSupportedHistoryFile(file.path) && !this.isIgnored(file.path))
			this.onVaultModify(file);
	};

	private async checkAutoGc(): Promise<void> {
		if (this.moduleSettings.autoGc === false || !this.remote || !this.stores) return;
		const now = Date.now();
		const lastGc = await readLastGcTime(this.stores);
		if (now - lastGc < DAY_MS) return;
		try {
			await this.runGc();
		} catch {
			// Background auto GC error is non-fatal
		}
	}

	private async runGc(): Promise<number> {
		if (!this.remote || !this.stores) return 0;
		await this.flushPendingDebounces();
		const result = await compact(
			{ remote: this.remote, stores: this.stores },
			{
				maxVersions: this.moduleSettings.maxVersions,
				retentionDays: this.moduleSettings.retentionDays,
			},
		);
		await saveLastGcTime(this.stores, Date.now());
		return result;
	}

	readonly dispose = () => {
		void this.flushPendingDebounces();
		void this.scheduler?.onUnload();
		for (const pending of this.pendingDebounces.values()) clearTimeout(pending.timer);
		this.pendingDebounces.clear();
		this.syncWrittenFiles.clear();
		this.cleanup.splice(0).forEach((fn) => fn());
		this.scheduler?.dispose();
		this.stores = undefined;
		this.storesNamespace = undefined;
		this.remote = undefined;
		this.remoteFsUid = undefined;
	};
}

const namespaceOf = (ctx: HistoryContext): string | undefined => {
	const ns = ctx.getNamespace();
	return ns instanceof Error ? undefined : ns;
};

/** Translate types function-valued keys as DocumentFragment; our translations return strings. */
const text = (value: unknown): string => (typeof value === 'string' ? value : String(value));
