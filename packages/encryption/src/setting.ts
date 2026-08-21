import type { EncryptionSettings } from '@';
import type {
	CallableOrObjectTree,
	Context,
	Fragment,
	LabelDefinition,
	MaybePromise,
	Translate,
} from '@hesprs/sync-engine-sdk';
import type { App } from 'obsidian';
import { s, setNeedMigration } from '@hesprs/sync-engine-sdk';
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
		matchLabel: () => LabelDefinition;
	},
	settings: EncryptionSettings,
): CallableOrObjectTree {
	const { translate, app, saveSettings, recordStoreExists, matchLabel } = ctx;
	return {
		1000: {
			6037: s(() => ({
				desc: translate('encryptionDescription'),
				labels: [matchLabel()],
				name: translate('encryption'),
				render: (setting) => {
					setting
						.setClass('sync-engine-togglable-value')
						.addComponent((element) =>
							new SecretComponent(app, element)
								.setValue(settings.password)
								.onChange((value) => {
									settings.password = value ?? '';
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
								needMigration: () => recordStoreExists(),
								toggle: toggle.setValue(settings.enabled),
							}),
						);
				},
			})),
		},
	};
}
