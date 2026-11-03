import 'tsdown/client';
import { PendingAuthorization, TokenManager, bearerMiddleware } from './dropbox/auth';
import checkConnection from './dropbox/check-connection';
import DropboxFs from './dropbox/fs';
import { ru, en, zh, zhTW } from './i18n';
import dropboxOptimizer from './optimizer';
import dropboxSetting from './setting';
import styles from './styles.css?inline';
import { digOriginal, prefixWrapper } from '@hesprs/sync-engine-sdk';
import type { DropboxTranslations } from './setting';
import type {
	Context,
	FsWrapperEntry,
	ObsidianLanguageCode,
	OptimizerEntry,
	RemoteFsEntry,
	RemoteRequestMiddlewareEntry,
	SelectFromContext,
	SettingEntry,
	Settings,
	Translate,
	Translations,
	TranslationResource,
} from '@hesprs/sync-engine-sdk';
import type { App, ObsidianProtocolHandler } from 'obsidian';

export type DropboxSettings = { baseDirectory: string; useTrash: boolean; accountId: string };

export default class Dropbox {
	private readonly cleanup: Array<() => void> = [];
	private readonly tokenManager: TokenManager;
	private readonly pending = new PendingAuthorization();

	constructor(
		private readonly ctx: SelectFromContext<{
			translate: Translate<Translations & DropboxTranslations>;
			registerRemoteFs: (id: string, entry: RemoteFsEntry) => () => void;
			app: App;
			registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => void;
			registerRemoteRequestMiddleware: (entry: RemoteRequestMiddlewareEntry) => () => void;
			registerRemoteOptimizer: (entry: OptimizerEntry) => () => void;
			registerSetting: (entry: SettingEntry) => () => void;
			registerI18n: (lang: ObsidianLanguageCode, translations: TranslationResource) => void;
			registerCss: (css: string) => () => void;
			registerObsidianProtocolHandler: (
				action: string,
				handler: ObsidianProtocolHandler,
			) => () => void;
		}>,
	) {
		this.moduleSettings.baseDirectory ||= `${ctx.app.vault.getName().normalize('NFC')}/`;
		ctx.registerI18n('en', en);
		ctx.registerI18n('zh', zh);
		ctx.registerI18n('zh-TW', zhTW);
		ctx.registerI18n('ru', ru);
		this.tokenManager = new TokenManager(ctx.app.secretStorage);
	}

	readonly moduleSettings: DropboxSettings = { accountId: '', baseDirectory: '', useTrash: true };

	declare settings: Settings;

	readonly start = () => {
		const {
			translate,
			registerRemoteFs,
			registerRemoteFsWrapper,
			registerRemoteRequestMiddleware,
			registerRemoteOptimizer,
			registerSetting,
			registerCss,
			registerObsidianProtocolHandler,
		} = this.ctx;
		this.cleanup.push(
			registerCss(styles),
			registerRemoteFs('dropbox', {
				checkConnection,
				instantiate: (request) => new DropboxFs(request, this.moduleSettings),
				prettyName: () => translate('dropbox'),
			}),
			registerRemoteFsWrapper({
				apply: (fs) => {
					if (digOriginal(fs) instanceof DropboxFs)
						return prefixWrapper(fs, this.moduleSettings.baseDirectory);
				},
				priority: 6418,
			}),
			registerRemoteRequestMiddleware({
				apply: (request) => {
					if (this.settings.remoteFs === 'dropbox')
						return bearerMiddleware(request, this.tokenManager);
				},
				priority: 306,
			}),
			registerRemoteOptimizer({ apply: dropboxOptimizer, priority: 3342 }),
			registerSetting({
				apply: dropboxSetting(
					this.ctx as Context,
					this.moduleSettings,
					this.tokenManager,
					this.pending,
				),
				priority: 803,
			}),
			registerObsidianProtocolHandler('sync-engine-dropbox-auth', this.pending.notify),
		);
	};

	readonly dispose = () => this.cleanup.splice(0).forEach((fn) => fn());
}
