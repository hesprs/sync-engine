import type {
	Context,
	ObsidianLanguageCode,
	FsWrapperEntry,
	SelectFromContext,
	SettingEntry,
	TranslationResource,
	Translate,
} from '@hesprs/sync-engine-sdk';
import type { App } from 'obsidian';
import type { EncryptionTranslations } from '@/setting';
import type { EncryptionDB } from '@/wrapper';
import { en, zh, ru, zhTW } from '@/i18n';
import encryptionSetting from '@/setting';
import encryptionWrapper from '@/wrapper';

export type EncryptionSettings = {
	enabled: boolean;
	password: string;
	// TODO: remove after February 17, 2027
	legacyEndpoint?: string;
};

export default class Encryption {
	private readonly cleanup: Array<() => void> = [];

	constructor(
		private readonly ctx: SelectFromContext<{
			registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => void;
			app: App;
			memoryDB: EncryptionDB;
			registerSetting: (entry: SettingEntry) => () => void;
			registerI18n: (locale: ObsidianLanguageCode, resource: TranslationResource) => void;
			translate: Translate<EncryptionTranslations>;
		}>,
	) {
		ctx.registerI18n('en', en);
		ctx.registerI18n('zh', zh);
		ctx.registerI18n('ru', ru);
		ctx.registerI18n('zh-TW', zhTW);
	}

	moduleSettings: EncryptionSettings = {
		enabled: false,
		password: '',
	};

	readonly start = () => {
		const { app, memoryDB, registerRemoteFsWrapper, registerSetting, translate } = this.ctx;
		this.cleanup.push(
			registerRemoteFsWrapper({
				apply: (fs) => {
					if (!this.moduleSettings.enabled) return;
					const { password: pwd } = this.moduleSettings;
					const password = app.secretStorage.getSecret(pwd);
					if (!password) throw new Error(translate('pleaseSetPassword'));
					return encryptionWrapper(fs, {
						legacyEndpoint: this.moduleSettings.legacyEndpoint,
						memoryDB,
						password,
					});
				},
				priority: 7919,
			}),
			registerSetting({
				apply: encryptionSetting(this.ctx as Context, this.moduleSettings),
				priority: 1355,
			}),
		);
	};

	readonly dispose = () => this.cleanup.splice(0).forEach((fn) => fn());
}
