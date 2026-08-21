import type {
	Context,
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
import type { GdriveTranslations } from './setting';
import { TokenManager, bearerMiddleware } from './gdrive/auth';
import requestUrlHttp from './gdrive/auth-http';
import checkConnection from './gdrive/check-connection';
import GdriveFs from './gdrive/fs';
import en from './i18n';
import gdriveSetting from './setting';

export type GdriveSettings = {
	account: string;
	baseDirectory: string;
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	useTrash: boolean;
};

export default class Gdrive {
	private readonly cleanup: Array<() => void> = [];
	private readonly tokenManager: TokenManager;

	constructor(
		private readonly ctx: SelectFromContext<{
			translate: Translate<Translations & GdriveTranslations>;
			registerRemoteFs: (id: string, entry: RemoteFsEntry) => () => void;
			app: App;
			registerRemoteRequestMiddleware: (entry: RemoteRequestMiddlewareEntry) => () => void;
			registerSetting: (entry: SettingEntry) => () => void;
			registerI18n: (lang: ObsidianLanguageCode, translations: TranslationResource) => void;
			rerenderSettingTab: () => void;
		}>,
	) {
		if (!this.moduleSettings.baseDirectory)
			this.moduleSettings.baseDirectory = `${ctx.app.vault.getName()}/`;
		ctx.registerI18n('en', en);
		this.tokenManager = new TokenManager(requestUrlHttp, () => this.resolveAuth());
	}

	readonly moduleSettings: GdriveSettings = {
		account: '',
		baseDirectory: '',
		clientId: '',
		clientSecret: '',
		refreshToken: '',
		useTrash: true,
	};

	declare settings: Settings;

	readonly start = () => {
		const { translate, registerRemoteFs, registerRemoteRequestMiddleware, registerSetting } =
			this.ctx;
		this.cleanup.push(
			registerRemoteFs('gdrive', {
				checkConnection: (request) => {
					try {
						this.resolveConfig();
					} catch (error) {
						return {
							reason: error instanceof Error ? error.message : String(error),
							success: false,
						};
					}
					return checkConnection(request);
				},
				instantiate: (request) => {
					const config = this.resolveConfig();
					return new GdriveFs({
						account: config.account,
						baseDirectory: config.baseDirectory,
						request,
						useTrash: config.useTrash,
					});
				},
				prettyName: () => translate('gdrive'),
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

	private readonly resolveAuth = () => {
		const {
			clientId,
			clientSecret: clientSecretId,
			refreshToken: refreshTokenId,
		} = this.moduleSettings;
		const { secretStorage } = this.ctx.app;
		const clientSecret = secretStorage.getSecret(clientSecretId);
		if (!clientId || clientSecret === null || clientSecret === '')
			throw new Error('Please configure the Google Drive OAuth client!');
		const refreshToken = secretStorage.getSecret(refreshTokenId);
		if (refreshToken === null || refreshToken === '')
			throw new Error('Please connect your Google account in the Sync Engine settings!');
		return { clientId, clientSecret, refreshToken };
	};

	private readonly resolveConfig = () => {
		this.resolveAuth();
		const { account, baseDirectory, useTrash } = this.moduleSettings;
		return { account: account || 'unknown', baseDirectory, useTrash };
	};

	readonly dispose = () => {
		this.cleanup.forEach((fn) => fn());
		this.cleanup.length = 0;
	};
}
