import type {
	RemoteFsEntry,
	FsWrapperEntry,
	Translate,
	Translations,
	SelectFromContext,
	SettingEntry,
	ObsidianLanguageCode,
	TranslationResource,
	Settings,
	Context,
	RecordStore,
	RecordStat,
	StoreOperations,
	RemoteRequestMiddlewareEntry,
} from '@hesprs/sync-engine-sdk';
import type { App } from 'obsidian';
import { digOriginal, prefixWrapper } from '@hesprs/sync-engine-sdk';
import normalizeEtag from '@repo/shared/normalize-etag';
import type { WebdavTranslations } from '@/setting';
import { en, zh, zhTW, ru } from '@/i18n';
import authorizationMiddleware from '@/webdav/auth';
import { checkConnection } from '@/webdav/check-connection';
import WebdavFs from '@/webdav/fs';
import webdavSetting from './setting';

export type WebdavSettings = {
	baseDirectory: string;
	endpoint: string;
	password: string;
	username: string;
	// Server-dependent capabilities
	chunkedUpload: boolean;
	depthInfinity: boolean;
	fileMetadata: boolean;
};

export default class Webdav {
	private readonly cleanup: Array<() => void> = [];

	constructor(
		private readonly ctx: SelectFromContext<{
			translate: Translate<Translations & WebdavTranslations>;
			registerRemoteFs: (id: string, entry: RemoteFsEntry) => () => void;
			app: App;
			registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => void;
			registerSetting: (entry: SettingEntry) => () => void;
			registerI18n: (lang: ObsidianLanguageCode, translations: TranslationResource) => void;
			getRecordStore: (namespace?: string) => RecordStore | Error; // TODO: remove after October 13
			registerRemoteRequestMiddleware: (entry: RemoteRequestMiddlewareEntry) => () => void;
		}>,
	) {
		if (!this.moduleSettings.baseDirectory)
			this.moduleSettings.baseDirectory = `${ctx.app.vault.getName()}/`;
		ctx.registerI18n('en', en);
		ctx.registerI18n('zh', zh);
		ctx.registerI18n('zh-TW', zhTW);
		ctx.registerI18n('ru', ru);
	}

	readonly moduleSettings: WebdavSettings = {
		baseDirectory: '',
		chunkedUpload: false,
		depthInfinity: false,
		endpoint: '',
		fileMetadata: true,
		password: '',
		username: '',
	};

	declare settings: Settings;

	readonly start = () => {
		const {
			translate,
			registerRemoteFs,
			app: { secretStorage },
			registerRemoteFsWrapper,
			registerSetting,
			getRecordStore,
			registerRemoteRequestMiddleware,
		} = this.ctx;
		const guardEndpoint = () => {
			if (!this.moduleSettings.endpoint) throw new Error(translate('pleaseConfigureAccount'));
			return this.moduleSettings;
		};
		this.cleanup.push(
			registerRemoteFs('webdav', {
				checkConnection: (request) => checkConnection(guardEndpoint(), request),
				instantiate: (request) => new WebdavFs({ ...guardEndpoint(), request }),
				prettyName: () => translate('webdav'),
			}),
			registerRemoteRequestMiddleware({
				apply: (request) => {
					if (this.settings.remoteFs !== 'webdav') return;
					const { username, password: pwd } = this.moduleSettings;
					const password = secretStorage.getSecret(pwd);
					if (password === null) throw new Error(translate('pleaseConfigureAccount'));
					return authorizationMiddleware(request, { password, username });
				},
				priority: 692,
			}),
			registerRemoteFsWrapper({
				apply: (fs) => {
					if (digOriginal(fs) instanceof WebdavFs)
						return prefixWrapper(fs, this.moduleSettings.baseDirectory);
				},
				priority: 6318,
			}),
			registerSetting({
				apply: webdavSetting(this.ctx as Context, this.moduleSettings),
				priority: 749,
			}),
		);

		const store = getRecordStore();
		if (this.settings.remoteFs === 'webdav' && !(store instanceof Error))
			void migrateEtag(store).catch(() => {});
	};

	readonly dispose = () => {
		this.cleanup.forEach((fn) => fn());
		this.cleanup.length = 0;
	};
}

// TODO: remove after October 13
async function migrateEtag(store: RecordStore) {
	const changes: Array<StoreOperations<RecordStat>> = [];
	for (const [key, stat] of await store.entries()) {
		if (stat.isDir) return;
		const remote = normalizeEtag(stat.remote);
		if (remote !== stat.remote)
			changes.push({ key, type: 'set', value: Object.assign(stat, { remote }) });
	}
	if (!changes.length) return;
	await store.batch(changes);
}
