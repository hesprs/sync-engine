import {
	deriveRoomKeys,
	deriveTopic,
	encodeBase64Url,
	generateRoomCode as createRoomCode,
	isFresh,
	parseRoomCode,
} from '@/crypto';
import { en, ru, zh, zhTW } from '@/i18n';
import { cleanupMobileHeaderIcons, updateMobileHeaderIcons } from '@/mobile-status';
import { openPulse, parseEnvelope, preparePulse, SEEN_TTL, sealPulse } from '@/protocol';
import { RaceJournal } from '@/race';
import captureRemoteState from '@/remote-wrapper';
import collaborationSetting from '@/setting';
import RemoteStateCache from '@/state-cache';
import SyncBridge from '@/sync-bridge';
import CollaborationTransport from '@/transport';
import deviceType, { buildClientId, readSecret, text, toError } from '@/utils';
import type { CollaborationTranslations } from '@/i18n';
import type { Envelope, UserProperties } from '@/protocol';
import type { CollaborationSettings, CollaborationStatus } from '@/setting';
import type { GlobStrategy } from '@/types';
import type {
	ConflictResolver,
	DeciderEntry,
	Dispatch,
	Events,
	ExistingMemoryDB,
	FsWrapperEntry,
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

const DEFAULT_SECRET_ID = 'sync-engine-collaboration';
const MAX_SEEN = 8192;

type CollaborationContext = SelectFromContext<{
	app: App;
	deciderRegistry: Map<string, DeciderEntry>;
	dispatch: Dispatch<Events>;
	getConflictResolver: () => ConflictResolver;
	memoryDB: ExistingMemoryDB;
	on: On<Events>;
	refreshSettingTab: () => void;
	registerDecider: (id: string, entry: DeciderEntry) => () => boolean;
	rerenderSettingTab: () => void;
	registerI18n: (locale: ObsidianLanguageCode, resource: TranslationResource) => void;
	registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => boolean;
	registerSetting: (entry: SettingEntry) => () => boolean;
	registerTrigger: (key: string, entry: TriggerEntry) => () => boolean;
	requestSync: (trigger: string) => Promise<SyncTerminateReason>;
	saveSettings: () => Promise<void>;
	settings: { syncStrategy: Array<GlobStrategy> };
	translate: Translate<CollaborationTranslations>;
}>;

export default class Collaboration {
	private readonly cleanup: Array<() => void> = [];
	private readonly instanceId = encodeBase64Url(crypto.getRandomValues(new Uint8Array(9)));
	private readonly journal = new RaceJournal();
	private readonly seen = new Map<string, number>();
	private readonly stateCache = new RemoteStateCache();
	private statusExtraEl?: HTMLElement;
	private bridge?: SyncBridge;
	private clientId = '';
	private connectionGeneration = 0;
	private keys?: Awaited<ReturnType<typeof deriveRoomKeys>>;
	private lastErrorLog = 0;
	private lastInvalidLog = 0;
	private lastRemoteUid?: string;
	private lastStaleLog = 0;
	private publishQueued = false;
	private publishing = false;
	private roomTopic?: string;
	private status: CollaborationStatus = 'disabled';
	private statusError?: Error;
	private topic?: string;
	private transport?: CollaborationTransport;

	moduleSettings: CollaborationSettings = {
		brokerUrl: 'wss://broker.emqx.io:8084/mqtt',
		// Empty means "not set yet"; start() fills in the detected device type.
		clientIdPrefix: '',
		enabled: false,
		passwordSecretId: '',
		roomSecretId: '',
		username: '',
	};

	constructor(private readonly ctx: CollaborationContext) {
		ctx.registerI18n('en', en);
		ctx.registerI18n('zh', zh);
		ctx.registerI18n('zh-TW', zhTW);
		ctx.registerI18n('ru', ru);
	}

	readonly start = () => {
		const { ctx } = this;
		if (!this.moduleSettings.clientIdPrefix) {
			this.moduleSettings.clientIdPrefix = deviceType();
			void ctx.saveSettings();
		}
		this.bridge = new SyncBridge(
			{
				deciderRegistry: ctx.deciderRegistry,
				dispatch: ctx.dispatch,
				getConflictResolver: ctx.getConflictResolver,
				memoryDB: ctx.memoryDB,
				on: ctx.on,
				registerDecider: ctx.registerDecider,
				requestSync: ctx.requestSync,
				translate: ctx.translate,
			},
			{ journal: this.journal, rules: () => this.ctx.settings.syncStrategy },
		);
		this.cleanup.push(
			ctx.registerRemoteFsWrapper({
				apply: (fs) => {
					if (!this.moduleSettings.enabled || !this.bridge) return;
					return captureRemoteState(fs, {
						activeUploads: this.bridge.activeUploadKeys,
						enabled: () => this.moduleSettings.enabled,
						journal: this.journal,
						stateCache: this.stateCache,
					});
				},
				priority: 30_100,
			}),
			ctx.registerTrigger('collaboration', {
				options: () => this.bridge?.triggerOptions() ?? {},
				priority: 1500,
			}),
			ctx.registerSetting({
				apply: collaborationSetting(
					{
						app: ctx.app,
						copyRoomCode: this.copyRoomCode,
						copyTopic: this.copyTopic,
						generateRoomCode: this.generateRoomCode,
						getStatus: this.getStatus,
						getTopic: () => this.topic,
						reconnect: this.reconnect,
						refreshSettingTab: ctx.refreshSettingTab,
						rerenderSettingTab: ctx.rerenderSettingTab,
						saveSettings: ctx.saveSettings,
						translate: ctx.translate,
						updateMobileHeaderIcons: () => this.updateMobileHeaderIcons(),
					},
					this.moduleSettings,
				),
				priority: 3050,
			}),
			ctx.on('syncInitialized', ({ remoteFs }) => {
				this.lastRemoteUid = remoteFs.getUid();
			}),
			ctx.on('syncTerminated', () => {
				void this.publishPulse();
			}),
		);
		this.updateStatusExtra();
		if (typeof window !== 'undefined') {
			const onOnline = () => {
				if (this.moduleSettings.enabled && this.status !== 'connected')
					void this.reconnect();
			};
			const onVisibility = () => {
				if (
					document.visibilityState === 'visible' &&
					this.moduleSettings.enabled &&
					this.status !== 'connected'
				)
					void this.reconnect();
			};
			window.addEventListener('online', onOnline);
			document.addEventListener('visibilitychange', onVisibility);
			const onLeafChange = () => {
				this.updateMobileHeaderIcons();
			};
			const leafRef = this.ctx.app.workspace?.on?.('active-leaf-change', onLeafChange);
			const layoutRef = this.ctx.app.workspace?.on?.('layout-change', onLeafChange);
			this.cleanup.push(() => {
				window.removeEventListener('online', onOnline);
				document.removeEventListener('visibilitychange', onVisibility);
				if (leafRef) this.ctx.app.workspace?.offref?.(leafRef);
				if (layoutRef) this.ctx.app.workspace?.offref?.(layoutRef);
				cleanupMobileHeaderIcons();
			});
		}
		this.updateMobileHeaderIcons();
		void this.reconnect();
	};

	readonly dispose = () => {
		this.connectionGeneration++;
		this.transport?.disconnect();
		this.transport = undefined;
		this.bridge?.dispose();
		this.bridge = undefined;
		this.cleanup.splice(0).forEach((cleanup) => cleanup());
		this.seen.clear();
		this.journal.clear();
		this.stateCache.clearAll();
		this.keys = undefined;
		this.topic = undefined;
		this.roomTopic = undefined;
		this.publishQueued = false;
		this.status = 'disabled';
		this.updateStatusExtra();
		if (this.statusExtraEl) {
			this.statusExtraEl.remove();
			this.statusExtraEl = undefined;
		}
		cleanupMobileHeaderIcons();
	};

	private readonly getStatus = () => ({ error: this.statusError, status: this.status });

	private readonly setStatus = (status: CollaborationStatus, error?: Error) => {
		this.status = status;
		this.statusError = error;
		this.updateStatusExtra();
		this.updateMobileHeaderIcons();
		this.ctx.rerenderSettingTab();
	};

	private updateMobileHeaderIcons(): void {
		updateMobileHeaderIcons({
			app: this.ctx.app,
			enabled:
				this.moduleSettings.enabled && this.moduleSettings.showMobileStatusIcon !== false,
			error: this.statusError,
			status: this.status,
			translate: this.ctx.translate,
		});
	}

	private updateStatusExtra(): void {
		if (typeof document === 'undefined') return;
		const isAbnormal = this.moduleSettings.enabled && this.status === 'error';
		const existingStatusSpan =
			document.querySelector('.status-bar-item.plugin-sync-engine span.ml-1.max-w-250px') ??
			document.querySelector('.status-bar-item span.ml-1.max-w-250px');
		const parentEl = existingStatusSpan?.parentElement;

		if (!isAbnormal || !parentEl) {
			if (this.statusExtraEl) {
				this.statusExtraEl.remove();
				this.statusExtraEl = undefined;
			}
			return;
		}

		if (!this.statusExtraEl) {
			this.statusExtraEl = parentEl.createSpan({ cls: 'sync-engine-collab-extra' });
			this.statusExtraEl.style.color = 'var(--text-error, #f87171)';
			this.statusExtraEl.style.marginLeft = '4px';
			this.statusExtraEl.style.fontWeight = '500';
		}
		this.statusExtraEl.setText(text(this.ctx.translate('mqttErrorSuffix')));
		if (this.statusError?.message)
			this.statusExtraEl.setAttribute('title', `MQTT: ${this.statusError.message}`);
		else this.statusExtraEl.removeAttribute('title');
	}

	private readonly resetRoomState = () => {
		this.seen.clear();
		this.journal.clear();
		this.stateCache.clearAll();
		this.bridge?.reset();
		this.publishQueued = false;
	};

	private readonly reconnect = async () => {
		const generation = ++this.connectionGeneration;
		const previousTopic = this.roomTopic;
		this.transport?.disconnect();
		this.transport = undefined;
		this.keys = undefined;
		this.topic = undefined;
		this.publishQueued = false;
		if (!this.moduleSettings.enabled) {
			this.setStatus('disabled');
			return;
		}
		const secret = this.moduleSettings.roomSecretId
			? this.ctx.app.secretStorage.getSecret(this.moduleSettings.roomSecretId)
			: undefined;
		if (!secret) {
			this.setStatus('missing-room');
			this.ctx.dispatch('logGeneral', this.ctx.translate('roomCodeMissing'));
			return;
		}
		let room: ReturnType<typeof parseRoomCode>;
		try {
			room = parseRoomCode(secret);
		} catch {
			const error = new Error(text(this.ctx.translate('roomCodeInvalid')));
			this.setStatus('error', error);
			this.ctx.dispatch('errorGeneral', error);
			return;
		}
		let keys: Awaited<ReturnType<typeof deriveRoomKeys>>;
		let topic: string;
		try {
			keys = await deriveRoomKeys(room);
			topic = await deriveTopic(keys);
		} catch (error) {
			const normalized = toError(error);
			this.setStatus('error', normalized);
			this.ctx.dispatch('errorGeneral', normalized);
			return;
		}
		if (generation !== this.connectionGeneration) return;
		if (previousTopic !== undefined && previousTopic !== topic) this.resetRoomState();
		this.keys = keys;
		this.roomTopic = topic;
		this.topic = topic;
		this.clientId = buildClientId(this.moduleSettings.clientIdPrefix, this.instanceId);
		const transport = new CollaborationTransport({
			clientId: this.clientId,
			onMessage: this.onMessage,
			onStatus: this.onStatus,
			password: readSecret(this.ctx.app, this.moduleSettings.passwordSecretId),
			topic,
			url: this.moduleSettings.brokerUrl,
			username: this.moduleSettings.username || undefined,
		});
		this.transport = transport;
		await transport.connect();
		if (generation !== this.connectionGeneration) transport.disconnect();
	};

	private readonly onStatus = (
		status: 'connected' | 'connecting' | 'disabled' | 'error' | 'reconnecting',
		error?: Error,
	) => {
		this.setStatus(status, error ?? (status === 'reconnecting' ? this.statusError : undefined));
		const now = Date.now();
		if (error && now - this.lastErrorLog > 5000) {
			this.lastErrorLog = now;
			this.ctx.dispatch(
				'errorGeneral',
				new Error(text(this.ctx.translate('brokerConnectionError', error.message))),
			);
		}
		if (status === 'connected') void this.publishPulse();
	};

	private readonly onMessage = (raw: string, properties: UserProperties) => {
		if (!this.keys || !this.topic) return;
		let envelope: Envelope;
		try {
			envelope = parseEnvelope(raw, properties);
		} catch {
			this.logInvalidMessage();
			return;
		}
		if (envelope.clientId === this.clientId) return;
		if (!isFresh(envelope.sentAt)) {
			this.logStaleMessage();
			return;
		}
		if (this.seen.has(envelope.batchId)) return;
		this.seen.set(envelope.batchId, Date.now());
		this.pruneReceived();
		void this.finishPulse(envelope);
	};

	private readonly finishPulse = async (envelope: Envelope) => {
		const keys = this.keys;
		const topic = this.topic;
		if (!keys || !topic) return;
		try {
			const pulse = await openPulse({ envelope, keys, topic });
			if (!isFresh(pulse.sentAt) || this.topic !== topic) return;
			this.bridge?.accept(pulse);
		} catch {
			this.logInvalidMessage();
		}
	};

	private readonly pruneReceived = () => {
		const now = Date.now();
		for (const [key, timestamp] of this.seen)
			if (now - timestamp > SEEN_TTL) this.seen.delete(key);
		while (this.seen.size > MAX_SEEN) {
			const oldest = this.seen.keys().next().value;
			if (oldest === undefined) break;
			this.seen.delete(oldest);
		}
	};

	private readonly logInvalidMessage = () => {
		const now = Date.now();
		if (now - this.lastInvalidLog < 5000) return;
		this.lastInvalidLog = now;
		this.ctx.dispatch('logGeneral', this.ctx.translate('invalidMessage'));
	};

	private readonly logStaleMessage = () => {
		const now = Date.now();
		if (now - this.lastStaleLog < 60_000) return;
		this.lastStaleLog = now;
		this.ctx.dispatch('logGeneral', this.ctx.translate('staleMessage'));
	};

	private readonly publishPulse = async () => {
		if (this.publishing) {
			this.publishQueued = true;
			return;
		}
		if (
			!this.moduleSettings.enabled ||
			!this.keys ||
			!this.topic ||
			!this.transport ||
			this.status !== 'connected' ||
			!this.lastRemoteUid
		)
			return;
		const uid = this.lastRemoteUid;
		if (!this.stateCache.isDirty(uid)) return;
		const revision = this.stateCache.getRevision(uid);
		const changedKeys = this.stateCache.takeChanged(uid);
		const generation = this.connectionGeneration;
		const keys = this.keys;
		const topic = this.topic;
		const transport = this.transport;
		this.publishing = true;
		try {
			const prepared = preparePulse({ keys: changedKeys, sentAt: Date.now() });
			if (generation !== this.connectionGeneration || transport !== this.transport) return;
			const envelopes = await sealPulse({ clientId: this.clientId, keys, prepared, topic });
			if (generation !== this.connectionGeneration || transport !== this.transport) return;
			await transport.publish(envelopes);
			if (generation !== this.connectionGeneration || transport !== this.transport) return;
			this.stateCache.clearDirty(uid, revision);
		} catch (error) {
			const normalized = toError(error);
			this.ctx.dispatch(
				'errorGeneral',
				new Error(text(this.ctx.translate('publishFailed', normalized.message))),
			);
		} finally {
			this.publishing = false;
			if (this.publishQueued) {
				this.publishQueued = false;
				void this.publishPulse();
			}
		}
	};

	private readonly generateRoomCode = async (): Promise<boolean> => {
		const code = createRoomCode();
		const id = this.moduleSettings.roomSecretId || DEFAULT_SECRET_ID;
		this.ctx.app.secretStorage.setSecret(id, code);
		this.moduleSettings.roomSecretId = id;
		await this.ctx.saveSettings();
		const copied = await this.copyRoomCode();
		void this.reconnect();
		return copied;
	};

	private readonly copyRoomCode = async (): Promise<boolean> => {
		const id = this.moduleSettings.roomSecretId;
		if (!id) return false;
		const code = this.ctx.app.secretStorage.getSecret(id);
		if (!code || !navigator.clipboard) return false;
		await navigator.clipboard.writeText(code);
		return true;
	};

	private readonly copyTopic = async (): Promise<boolean> => {
		const topic = this.topic;
		if (!topic || !navigator.clipboard) return false;
		await navigator.clipboard.writeText(topic);
		return true;
	};
}
