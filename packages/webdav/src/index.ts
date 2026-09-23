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
} from '@hesprs/sync-engine-sdk';
import type { App } from 'obsidian';
import { digOriginal, prefixWrapper } from '@hesprs/sync-engine-sdk';
import normalizeEtag from '@repo/shared/normalize-etag';
import type { WebdavTranslations } from './setting';
import { en, zh, zhTW, ru } from './i18n';
import webdavSetting from './setting';
import { checkConnection } from './webdav/check-connection';
import WebdavFs from './webdav/fs';

export type WebdavSettings = {
	baseDirectory: string;
	chunkedUpload: boolean;
	depthInfinity: boolean;
	endpoint: string;
	password: string;
	username: string;
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
			getRecordStore: (namespace?: string) => RecordStore; // TODO: remove after October 13
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
		} = this.ctx;
		const resolveConfig = () => {
			const {
				endpoint,
				username,
				password: pwd,
				chunkedUpload,
				depthInfinity,
			} = this.moduleSettings;
			const password = secretStorage.getSecret(pwd);
			if (password === null || !endpoint) throw new Error('Please configure WebDAV account!');
			return { chunkedUpload, depthInfinity, endpoint, password, username };
		};
		this.cleanup.push(
			registerRemoteFs('webdav', {
				checkConnection: (request) => {
					const config = resolveConfig();
					return checkConnection(config, request);
				},
				instantiate: (request) => new WebdavFs({ ...resolveConfig(), request }),
				prettyName: () => translate('webdav'),
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

		if (this.settings.remoteFs === 'webdav') void migrateEtag(getRecordStore()).catch(() => {});
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
