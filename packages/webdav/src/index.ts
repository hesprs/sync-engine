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
	RemoteRequestMiddlewareEntry,
} from '@hesprs/sync-engine-sdk';
import type { App } from 'obsidian';
import { digOriginal, prefixWrapper } from '@hesprs/sync-engine-sdk';
import { parseUrl } from '@repo/shared/path';
import type { WebdavTranslations } from '@/setting';
import { en, zh, zhTW, ru } from '@/i18n';
import webdavSetting from '@/setting';
import authorizationMiddleware from '@/webdav/auth';
import { checkConnection } from '@/webdav/check-connection';
import WebdavFs from '@/webdav/fs';

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
			registerRemoteRequestMiddleware: (entry: RemoteRequestMiddlewareEntry) => () => void;
			settings: Settings;
			getNamespace: Context['getNamespace'];
			indexedDB: Context['indexedDB'];
			saveSettings: () => Promise<void>;
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
		void this.migrateEndpoint().catch(() => {});
	};

	// TODO: remove after November 17, 2026
	private readonly migrateEndpoint = async () => {
		const legacyEndpoint = this.moduleSettings.endpoint;
		if (!legacyEndpoint) return;
		let endpoint = legacyEndpoint;
		try {
			endpoint = parseUrl(legacyEndpoint);
		} catch {
			// Keep the legacy endpoint if it cannot be parsed
		}
		if (endpoint === legacyEndpoint) return;
		const { settings, getNamespace, indexedDB, saveSettings } = this.ctx;
		const active = settings.remoteFs === 'webdav';
		const oldNamespace = active ? getNamespace() : undefined;
		this.moduleSettings.endpoint = endpoint;
		const encryption = settings.modules.encryption as
			| { enabled?: boolean; legacyEndpoint?: string }
			| undefined;
		if (active && encryption?.enabled === true) encryption.legacyEndpoint = legacyEndpoint;
		await saveSettings();
		const newNamespace = active ? getNamespace() : undefined;
		if (typeof oldNamespace !== 'string' || typeof newNamespace !== 'string') return;
		const names = await indexedDB.getStoreNames();
		for (const name of names) {
			const target = name.replace(oldNamespace, newNamespace);
			if (target === name || names.includes(target)) continue;
			const entries: Array<[string, unknown]> = await indexedDB.getStore(name).entries();
			await indexedDB
				.getStore(target)
				.batch(entries.map(([key, value]) => ({ key, type: 'set' as const, value })));
			await indexedDB.deleteStore(name);
		}
	};

	readonly dispose = () => {
		this.cleanup.forEach((fn) => fn());
		this.cleanup.length = 0;
	};
}
