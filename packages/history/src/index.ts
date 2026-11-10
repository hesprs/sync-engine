import { createHistoryCipher } from '@/crypto';
import { FlushScheduler, reconcile } from '@/flush';
import { compact } from '@/gc';
import { en, ru, zh, zhTW } from '@/i18n';
import { allCommitLocations } from '@/index-store';
import HistoryModal, { RecoverDeletedModal } from '@/modal';
import { openRemoteHistory } from '@/remote';
import { listVersions, restoreVersion } from '@/restore';
import historySetting from '@/setting';
import { openHistoryStores } from '@/store';
import { ingestDeletion, ingestEdit } from '@/wal';
import { sha256Bytes } from '@repo/shared/sha256-bytes';
import { Notice } from 'obsidian';
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
import type { App, Command, EventRef, Menu, TAbstractFile, TFile } from 'obsidian';

const DEBOUNCE_MS = 15_000;
const MAX_WAIT_MS = 60_000;
const DAY_MS = 86_400_000;

function isSupportedHistoryFile(path: string): boolean {
	const lower = path.toLowerCase();
	return (
		lower.endsWith('.md') ||
		lower.endsWith('.canvas') ||
		lower.endsWith('.txt') ||
		lower.endsWith('.json')
	);
}

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
	settings: { modules: Record<string, object> };
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
	private stores?: HistoryStores;
	private remote?: RemoteHistory;
	private scheduler?: FlushScheduler;
	private cipher?: HistoryCipher;
	private deviceId = '';

	moduleSettings: HistorySettings = {
		autoGc: true,
		deviceId: '',
		maxVersions: 100,
		retentionDays: 90,
	};

	constructor(private readonly ctx: HistoryContext) {
		ctx.registerI18n('en', en);
		ctx.registerI18n('zh', zh);
		ctx.registerI18n('zh-TW', zhTW);
		ctx.registerI18n('ru', ru);
	}

	readonly start = () => {
		const { ctx } = this;
		if (!this.moduleSettings.deviceId) {
			this.moduleSettings.deviceId = crypto.randomUUID();
			void ctx.saveSettings();
		}
		this.deviceId = this.moduleSettings.deviceId;
		const stores = openHistoryStores(ctx.indexedDB, namespaceOf(ctx));
		this.stores = stores;
		ctx.registerEvent(ctx.app.vault.on('modify', this.onVaultModify));
		ctx.registerEvent(ctx.app.vault.on('delete', this.onVaultDelete));
		ctx.registerEvent(ctx.app.vault.on('rename', this.onVaultRename));
		ctx.registerEvent(ctx.app.workspace.on('file-menu', this.onFileMenu));
		ctx.addCommand({
			callback: () => void this.openRecoverDeletedModal(),
			id: 'history-recover-deleted',
			name: ctx.translate('recoverDeleted'),
		});
		this.cleanup.push(
			ctx.on('syncInitialized', ({ remoteFs }) => {
				void this.initializeRemote(remoteFs, stores);
			}),
			ctx.on('syncTerminated', () => {
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
			const onBeforeUnload = () => {
				void this.flushPendingDebounces();
			};
			window.addEventListener('beforeunload', onBeforeUnload);
			this.cleanup.push(() => {
				window.removeEventListener('visibilitychange', onVisibility);
				window.removeEventListener('beforeunload', onBeforeUnload);
			});
		}
	};

	/**
	 * Derives a content cipher when the encryption module is active, then opens the isolated
	 * history handle. If encryption is on but its password is missing we deliberately keep
	 * `this.remote` unset so no plaintext history can be written.
	 */
	private async initializeRemote(remoteFs: Fs, stores: HistoryStores): Promise<void> {
		const { ctx } = this;
		let cipher: HistoryCipher | undefined;
		try {
			cipher = await createHistoryCipher(ctx.settings.modules, ctx.app);
		} catch (error) {
			new Notice(`History encryption: ${String(error)}`);
			return;
		}
		this.cipher = cipher;
		const remote = openRemoteHistory(
			remoteFs,
			ctx.getNamespace(undefined, remoteFs),
			this.deviceId,
			cipher,
		);
		if (!remote) return;
		this.remote = remote;
		this.scheduler = new FlushScheduler({
			remote,
			requestSync: (trigger) => void ctx.requestSync(trigger),
			stores,
		});
		void reconcile({ remote, requestSync: () => {}, stores });
		void this.checkAutoGc();
	}

	/** Adds a per-file "Show history" item to the file explorer context menu. */
	private readonly onFileMenu = (menu: Menu, file: TAbstractFile) => {
		if ('children' in file || !isSupportedHistoryFile(file.path)) return;
		menu.addItem((item) => {
			item.setTitle(this.ctx.translate('showHistory'))
				.setIcon('history')
				.onClick(() => void this.openHistoryForPath(file.path));
		});
	};

	private async openHistoryForPath(filePath: string): Promise<void> {
		if (!this.remote || !this.stores) return;
		await this.flushPendingDebounces();
		const ctx = { remote: this.remote, stores: this.stores };
		let versions;
		try {
			versions = await listVersions(ctx, filePath);
		} catch (error) {
			new Notice(text(this.ctx.translate('loadFailed', String(error))));
			return;
		}
		new HistoryModal(
			{ app: this.ctx.app, translate: this.ctx.translate },
			{ path: filePath },
			versions,
			{
				load: async (key, lamport) => {
					const result = await restoreVersion(ctx, { key, lamport });
					return result.text;
				},
				restore: async (content) => {
					const existing = this.ctx.app.vault.getAbstractFileByPath(filePath);
					await (existing && 'read' in existing
						? this.ctx.app.vault.modify(existing as unknown as TFile, content)
						: this.ctx.app.vault.create(filePath, content));
				},
			},
		).open();
	}

	private async openRecoverDeletedModal(): Promise<void> {
		if (!this.stores || !this.remote) return;
		await this.flushPendingDebounces();
		const locations = await allCommitLocations(this.stores);
		const deletedKeys = [
			...new Set(
				locations
					.map(([key]) => key.split('@')[0])
					.filter((key) => !this.ctx.app.vault.getAbstractFileByPath(key)),
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

	private async commitEdit(key: string, data: Uint8Array, hash: string): Promise<void> {
		if (!this.stores) return;
		this.lastIngestedHash.set(key, hash);
		const entry = await ingestEdit(this.stores, key, data);
		this.scheduler?.onEdit(entry.text?.length ?? entry.newChunks?.length ?? 0);
	}

	private async flushPendingDebounces(): Promise<void> {
		if (!this.stores || this.pendingDebounces.size === 0) return;
		const entries = [...this.pendingDebounces.entries()];
		this.pendingDebounces.clear();
		for (const [key, pending] of entries) {
			clearTimeout(pending.timer);
			const hash = await sha256Bytes(pending.data);
			await this.commitEdit(key, pending.data, hash);
		}
	}

	private readonly onVaultModify = (file: TAbstractFile) => {
		if (!this.stores || 'children' in file || !isSupportedHistoryFile(file.path)) return;
		const filePath = file.path;
		void this.ctx.app.vault.read(file as TFile).then(
			(content) => {
				const stores = this.stores;
				if (!stores) return;
				const data = new TextEncoder().encode(content);
				void sha256Bytes(data).then((hash) => {
					if (this.lastIngestedHash.get(filePath) === hash) return;
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
			},
			() => {},
		);
	};

	private readonly onVaultDelete = (file: TAbstractFile) => {
		if (!this.stores || 'children' in file || !isSupportedHistoryFile(file.path)) return;
		const filePath = file.path;
		const pending = this.pendingDebounces.get(filePath);
		if (pending) {
			clearTimeout(pending.timer);
			this.pendingDebounces.delete(filePath);
		}
		this.lastIngestedHash.delete(filePath);
		void ingestDeletion(this.stores, filePath).then(() => {
			this.scheduler?.onEdit(0);
		});
	};

	private readonly onVaultRename = (file: TAbstractFile, oldPath: string) => {
		if (!this.stores || 'children' in file) return;
		const pendingOld = this.pendingDebounces.get(oldPath);
		if (pendingOld) {
			clearTimeout(pendingOld.timer);
			this.pendingDebounces.delete(oldPath);
		}
		this.lastIngestedHash.delete(oldPath);
		if (isSupportedHistoryFile(file.path)) this.onVaultModify(file);
	};

	private async checkAutoGc(): Promise<void> {
		if (this.moduleSettings.autoGc === false || !this.remote || !this.stores) return;
		const now = Date.now();
		if (now - (this.moduleSettings.lastGcTime ?? 0) < DAY_MS) return;
		try {
			await this.runGc();
			this.moduleSettings.lastGcTime = now;
			void this.ctx.saveSettings();
		} catch {
			// Background auto GC error is non-fatal
		}
	}

	private async runGc(): Promise<number> {
		if (!this.remote || !this.stores) return 0;
		await this.flushPendingDebounces();
		return compact(
			{ remote: this.remote, stores: this.stores },
			{
				maxVersions: this.moduleSettings.maxVersions,
				retentionDays: this.moduleSettings.retentionDays,
			},
		);
	}

	readonly dispose = () => {
		void this.flushPendingDebounces();
		void this.scheduler?.onUnload();
		for (const pending of this.pendingDebounces.values()) clearTimeout(pending.timer);
		this.pendingDebounces.clear();
		this.cleanup.splice(0).forEach((fn) => fn());
		this.scheduler?.dispose();
		this.stores = undefined;
		this.remote = undefined;
	};
}

function namespaceOf(ctx: HistoryContext): string {
	const ns = ctx.getNamespace();
	return ns instanceof Error ? '' : ns;
}

/** Translate types function-valued keys as DocumentFragment; our translations return strings. */
function text(value: unknown): string {
	return typeof value === 'string' ? value : String(value);
}
