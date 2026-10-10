import type {
	Events,
	FsWrapperEntry,
	On,
	ObsidianLanguageCode,
	RemoteRequestMiddlewareEntry,
	SelectFromContext,
	SettingEntry,
	Translate,
	TranslationResource,
} from '@hesprs/sync-engine-sdk';
import type { MetadataSettings, MetadataTranslations } from './setting';
import type { BackendSettings } from './target';
import { en, zh, zhTW, ru } from './i18n';
import MetadataRemoteFs, { RemoteSession, remoteMiddleware, UploadRemoteFs } from './remote';
import metadataSetting from './setting';
import { getTarget } from './target';

export default class OpenListFileMetadata {
	private readonly cleanup: Array<() => void> = [];
	private readonly sessions = new Set<RemoteSession>();
	private remote?: RemoteSession;
	private active = false;

	constructor(
		private readonly ctx: SelectFromContext<{
			settings: BackendSettings;
			memoryDB?: { getStore: (name: 'remoteContext20000') => { clear: () => void } };
			on: On<Events>;
			registerRemoteRequestMiddleware: (entry: RemoteRequestMiddlewareEntry) => () => void;
			registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => void;
			registerSetting: (entry: SettingEntry) => () => void;
			registerI18n: (lang: ObsidianLanguageCode, resource: TranslationResource) => void;
			translate: Translate<MetadataTranslations>;
			saveSettings: () => Promise<void>;
		}>,
	) {
		ctx.registerI18n('en', en);
		ctx.registerI18n('zh', zh);
		ctx.registerI18n('zh-TW', zhTW);
		ctx.registerI18n('ru', ru);
	}

	readonly moduleSettings: MetadataSettings = { preferMetadataMtime: false };
	private readonly enabled = () =>
		this.active &&
		(this.ctx.settings.remoteFs === 's3' || this.ctx.settings.remoteFs === 'webdav');

	readonly start = () => {
		this.active = true;
		// Cached discovery must include inferred directories and standard file times.
		this.ctx.memoryDB?.getStore('remoteContext20000').clear();
		this.cleanup.push(
			this.ctx.registerSetting({
				apply: metadataSetting(this.ctx, this.moduleSettings),
				priority: 1356,
			}),
			this.ctx.registerRemoteRequestMiddleware({
				apply: (request) => {
					this.remote = undefined;
					const target = getTarget(this.ctx.settings);
					if (!target) return;
					this.remote = new RemoteSession(
						target,
						() => this.enabled() && this.ctx.settings.remoteFs === target.kind,
						() => this.moduleSettings.preferMetadataMtime,
						() =>
							(
								this.ctx.settings.modules.encryption as
									| { enabled?: boolean }
									| undefined
							)?.enabled ?? false,
					);
					this.sessions.add(this.remote);
					return remoteMiddleware(request, this.remote);
				},
				priority: 4001,
			}),
			this.ctx.registerRemoteFsWrapper({
				apply: (fs) => (this.remote ? new UploadRemoteFs(fs, this.remote) : undefined),
				priority: 500,
			}),
			this.ctx.registerRemoteFsWrapper({
				apply: (fs) => (this.remote ? new MetadataRemoteFs(fs, this.remote) : undefined),
				priority: 9000,
			}),
			this.ctx.on('syncTerminated', this.clear),
		);
	};

	private readonly clear = () => {
		for (const session of this.sessions) session.clear();
		this.sessions.clear();
		this.remote = undefined;
	};

	readonly dispose = () => {
		this.active = false;
		this.cleanup.splice(0).forEach((fn) => fn());
		this.clear();
	};
}
