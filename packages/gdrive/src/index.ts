import 'tsdown/client';
import type {
	Context,
	FsWrapperEntry,
	ObsidianLanguageCode,
	RemoteFsEntry,
	RemoteRequestMiddlewareEntry,
	SelectFromContext,
	SettingEntry,
	Settings,
	Translate,
	Translations,
	TranslationResource,
} from '@hesprs/sync-engine-sdk';
import type { App } from 'obsidian';
import { digOriginal, prefixWrapper } from '@hesprs/sync-engine-sdk';
import type { GdriveDB } from './gdrive/fs';
import type { GdriveTranslations } from './setting';
import { TokenManager, bearerMiddleware } from './gdrive/auth';
import checkConnection from './gdrive/check-connection';
import GdriveFs from './gdrive/fs';
import { ru, en, zh, zhTW } from './i18n';
import gdriveSetting from './setting';
import styles from './styles.css?inline';

export type GdriveSettings = {
	baseDirectory: string;
	useTrash: boolean;
	userId: string;
};

export default class Gdrive {
	private readonly cleanup: Array<() => void> = [];
	private readonly tokenManager: TokenManager;

	constructor(
		private readonly ctx: SelectFromContext<{
			translate: Translate<Translations & GdriveTranslations>;
			registerRemoteFs: (id: string, entry: RemoteFsEntry) => () => void;
			app: App;
			memoryDB: GdriveDB;
			registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => void;
			registerRemoteRequestMiddleware: (entry: RemoteRequestMiddlewareEntry) => () => void;
			registerSetting: (entry: SettingEntry) => () => void;
			registerI18n: (lang: ObsidianLanguageCode, translations: TranslationResource) => void;
			registerCss: (css: string) => () => void;
		}>,
	) {
		if (!this.moduleSettings.baseDirectory)
			this.moduleSettings.baseDirectory = `${ctx.app.vault.getName()}/`;
		ctx.registerI18n('en', en);
		ctx.registerI18n('zh', zh);
		ctx.registerI18n('zh-TW', zhTW);
		ctx.registerI18n('ru', ru);
		this.tokenManager = new TokenManager(ctx.app.secretStorage);
	}

	readonly moduleSettings: GdriveSettings = {
		baseDirectory: '',
		useTrash: true,
		userId: '',
	};

	declare settings: Settings;

	readonly start = () => {
		const {
			translate,
			registerRemoteFs,
			memoryDB,
			registerRemoteFsWrapper,
			registerRemoteRequestMiddleware,
			registerSetting,
			registerCss,
		} = this.ctx;
		this.cleanup.push(
			registerCss(styles),
			registerRemoteFs('gdrive', {
				checkConnection,
				instantiate: (request) => new GdriveFs(request, this.moduleSettings, memoryDB),
				prettyName: () => translate('gdrive'),
			}),
			registerRemoteFsWrapper({
				apply: (fs) => {
					if (digOriginal(fs) instanceof GdriveFs)
						return prefixWrapper(fs, this.moduleSettings.baseDirectory);
				},
				priority: 8308,
			}),
			registerRemoteRequestMiddleware({
				apply: (request) => {
					if (this.settings.remoteFs !== 'gdrive') return;
					return bearerMiddleware(request, this.tokenManager);
				},
				priority: 305,
			}),
			registerSetting({
				apply: gdriveSetting(this.ctx as Context, this.moduleSettings, this.tokenManager),
				priority: 683,
			}),
		);
	};

	readonly dispose = () => {
		this.cleanup.forEach((fn) => fn());
		this.cleanup.length = 0;
	};
}
