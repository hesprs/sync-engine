import { en, ru, zh, zhTW } from '@/i18n';
import webdavSetting from '@/setting';
import authorizationMiddleware from '@/webdav/auth';
import { checkConnection } from '@/webdav/check-connection';
import WebdavFs from '@/webdav/fs';
import { digOriginal, prefixWrapper } from '@hesprs/sync-engine-sdk';
import type { WebdavTranslations } from '@/setting';
import type { DigestInfo } from '@/webdav/auth';
import type {
	Context,
	DatabaseSync,
	FsWrapperEntry,
	ObsidianLanguageCode,
	RemoteFsEntry,
	RemoteRequestMiddlewareEntry,
	SelectFromContext,
	SettingEntry,
	Settings,
	Translate,
	TranslationResource,
	Translations,
} from '@hesprs/sync-engine-sdk';
import type { App } from 'obsidian';

export type WebdavSettings = {
	baseDirectory: string;
	endpoint: string;
	password: string;
	username: string;
	// Server-dependent capabilities
	chunkedUpload: boolean;
	depthInfinity: boolean;
	fileMetadata: boolean;
	timestampHeaders: boolean;
};

export type WebdavDB = DatabaseSync<
	Record<string, unknown>,
	{ authMarker?: string; digest?: DigestInfo }
>;

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
			registerRemoteRequestMiddleware: (entry: RemoteRequestMiddlewareEntry) => () => void;
			memoryDB: WebdavDB;
		}>,
	) {
		this.moduleSettings.baseDirectory ||= `${ctx.app.vault.getName().normalize('NFC')}/`;
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
		timestampHeaders: false,
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
			registerRemoteRequestMiddleware,
			memoryDB,
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
					return authorizationMiddleware(
						request,
						{ endpoint: this.moduleSettings.endpoint, password, username },
						memoryDB,
					);
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
	};

	readonly dispose = () => {
		this.cleanup.forEach((fn) => fn());
		this.cleanup.length = 0;
	};
}
