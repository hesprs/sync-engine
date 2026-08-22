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
import type { GdriveTranslations } from './setting';
import { TokenManager, bearerMiddleware } from './gdrive/auth';
import checkConnection from './gdrive/check-connection';
import GdriveFs from './gdrive/fs';
import en from './i18n';
import gdriveSetting from './setting';

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
			registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => void;
			registerRemoteRequestMiddleware: (entry: RemoteRequestMiddlewareEntry) => () => void;
			registerSetting: (entry: SettingEntry) => () => void;
			registerI18n: (lang: ObsidianLanguageCode, translations: TranslationResource) => void;
		}>,
	) {
		if (!this.moduleSettings.baseDirectory)
			this.moduleSettings.baseDirectory = `${ctx.app.vault.getName()}/`;
		ctx.registerI18n('en', en);
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
			registerRemoteFsWrapper,
			registerRemoteRequestMiddleware,
			registerSetting,
		} = this.ctx;
		this.cleanup.push(
			registerRemoteFs('gdrive', {
				checkConnection,
				instantiate: (request) => new GdriveFs(request, this.moduleSettings),
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
