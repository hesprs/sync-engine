import { s, setNeedMigration } from '@hesprs/sync-engine-sdk';
import { ConfirmationModal, SecretComponent } from 'obsidian';
import type { EncryptionSettings } from '@';
import type {
	CallableOrObjectTree,
	Fragment,
	LabelDefinition,
	MaybePromise,
	Translate,
	Translations,
} from '@hesprs/sync-engine-sdk';
import type { App } from 'obsidian';

export type EncryptionTranslations = {
	encryption: string;
	encryptionDescription: string;
	encryptionMigration: Fragment<boolean>;
	pleaseSetPassword: string;
	considerMigratingRemote: string;
	considerMigratingRemoteDescription: string;
	critical: string;
	criticalLabelTooltip: string;
	migrationExplanation: Fragment;
	detail: string;
};

export default function encryptionSetting(
	ctx: {
		translate: Translate<EncryptionTranslations & Translations>;
		app: App;
		saveSettings: () => Promise<void>;
		recordStoreExists: () => MaybePromise<boolean>;
		matchLabel: () => LabelDefinition;
		refreshSettingTab: () => void;
	},
	settings: EncryptionSettings,
): CallableOrObjectTree {
	const { translate, app, saveSettings, recordStoreExists, matchLabel, refreshSettingTab } = ctx;
	return {
		1000: {
			6037: s(() => ({
				desc: translate('encryptionDescription'),
				labels: [matchLabel()],
				name: translate('encryption'),
				render: (setting) => {
					setting
						.setClass('sync-engine-column')
						.addComponent((element) =>
							new SecretComponent(app, element)
								.setValue(settings.password)
								.onChange((value) => {
									settings.password = value ?? '';
									void saveSettings();
								}),
						)
						.addToggle((toggle) =>
							setNeedMigration(ctx, {
								apply: (value) => {
									settings.enabled = value;
									void saveSettings();
								},
								content: (value) => translate('encryptionMigration', value),
								needMigration: () => recordStoreExists(),
								toggle: toggle.setValue(settings.enabled),
							}),
						);
				},
			})),
			7037: s(() => ({
				desc: translate('considerMigratingRemoteDescription'),
				labels: [
					{
						color: 'var(--color-red)',
						text: translate('critical'),
						tooltip: translate('criticalLabelTooltip'),
					},
				],
				name: translate('considerMigratingRemote'),
				render: (setting) => {
					setting.addButton((button) =>
						button.setButtonText(translate('detail')).onClick(() => {
							const modal = new ConfirmationModal(app)
								.setTitle(translate('remoteMigration'))
								.setContent(translate('migrationExplanation'))
								.addCancelButton()
								.addButton((but) =>
									but
										.setButtonText(translate('confirm'))
										.onClick(() => {
											delete settings.legacyEndpoint;
											void saveSettings();
											refreshSettingTab();
										})
										.setCta(),
								);
							modal.contentEl.addClass('markdown-rendered');
							modal.open();
						}),
					);
				},
				visible: () => Boolean(settings.legacyEndpoint),
			})),
		},
	};
}
