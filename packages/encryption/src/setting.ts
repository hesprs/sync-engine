import type { EncryptionSettings } from '@';
import type { Context, Fragment, MaybePromise, Translate } from '@hesprs/sync-engine-sdk';
import type { App, SettingDefinitionItem } from 'obsidian';
import { setNeedMigration } from '@hesprs/sync-engine-sdk';
import { SecretComponent } from 'obsidian';

export type EncryptionTranslations = {
	encryption: string;
	encryptionDescription: string;
	encryptionMigration: Fragment<'enable' | 'disable'>;
};

export default function encryptionSetting(
	ctx: {
		translate: Translate<EncryptionTranslations>;
		app: App;
		saveSettings: () => Promise<void>;
		recordStoreExists: () => MaybePromise<boolean>;
	},
	settings: EncryptionSettings,
): Array<SettingDefinitionItem> {
	const { translate, app, saveSettings, recordStoreExists } = ctx;
	return [
		{
			desc: translate('encryptionDescription'),
			name: translate('encryption'),
			render: (setting) => {
				setting
					.addComponent((element) =>
						new SecretComponent(app, element)
							.setValue(settings.password)
							.onChange((value) => {
								settings.password = value;
								void saveSettings();
							}),
					)
					.addToggle((toggle) =>
						setNeedMigration(ctx as Context, {
							apply: (value) => {
								settings.enabled = value;
								void saveSettings();
							},
							content: (value) =>
								translate('encryptionMigration', value ? 'enable' : 'disable'),
							needMigration: recordStoreExists,
							toggle: toggle.setValue(settings.enabled),
						}),
					);
			},
		},
	];
}
