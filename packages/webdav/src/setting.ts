import type { WebdavSettings } from '@';
import type { Translate, Translations } from '@hesprs/sync-engine-sdk';
import type { App, SettingDefinitionItem } from 'obsidian';
import { normalizeBaseDir, normalizeUrl } from '@repo/shared/path';
import { SecretComponent } from 'obsidian';
import handleInput from './handle-input';

export type WebdavTranslations = {
	webdav: string;
	endpoint: string;
	endpointDescription: string;
	endpointPlaceholder: string;
	username: string;
	usernameDescription: string;
	usernamePlaceholder: string;
	password: string;
	passwordDescription: string;
	baseDirectory: string;
	baseDirectoryDescription: string;
	baseDirectoryPlaceholder: string;
	depthInfinity: string;
	depthInfinityDescription: string;
	chunkedUpload: string;
	chunkedUploadDescription: string;
};

export default function webdavSetting(
	{
		translate,
		saveSettings,
		app,
	}: {
		translate: Translate<WebdavTranslations & Translations>;
		saveSettings: () => Promise<void>;
		app: App;
	},
	settings: WebdavSettings,
): Array<SettingDefinitionItem> {
	const invalidValue = translate('invalidValue');
	return [
		{
			name: translate('webdav'),
			render: (setting) => {
				setting.setHeading();
			},
		},
		{
			desc: translate('endpointDescription'),
			name: translate('endpoint'),
			render: (setting) => {
				setting.addText((text) => {
					text.setPlaceholder(translate('endpointPlaceholder')).setValue(
						settings.endpoint,
					);
					handleInput({
						invalidValue,
						key: 'endpoint',
						processValue: (value) => {
							try {
								return normalizeUrl(value);
							} catch {
								return false;
							}
						},
						saveSettings,
						settings,
						text,
					});
				});
			},
		},
		{
			desc: translate('usernameDescription'),
			name: translate('username'),
			render: (setting) => {
				setting.addText((text) => {
					text.setPlaceholder(translate('usernamePlaceholder')).setValue(
						settings.username,
					);
					handleInput({
						invalidValue,
						key: 'username',
						processValue: (value) => value.trim(),
						saveSettings,
						settings,
						text,
					});
				});
			},
		},
		{
			desc: translate('passwordDescription'),
			name: translate('password'),
			render: (setting) => {
				setting.addComponent((element) =>
					new SecretComponent(app, element)
						.setValue(settings.password)
						.onChange((password) => {
							settings.password = password;
							void saveSettings();
						}),
				);
			},
		},
		{
			desc: translate('baseDirectoryDescription'),
			name: translate('baseDirectory'),
			render: (setting) => {
				setting.addText((text) => {
					text.setPlaceholder(translate('baseDirectoryPlaceholder')).setValue(
						settings.baseDirectory,
					);
					handleInput({
						invalidValue,
						key: 'baseDirectory',
						processValue: (original) => normalizeBaseDir(original.trim()),
						saveSettings,
						settings,
						text,
					});
				});
			},
		},
		{
			desc: translate('depthInfinityDescription'),
			name: translate('depthInfinity'),
			render: (setting) => {
				setting.addToggle((toggle) =>
					toggle.setValue(settings.depthInfinity).onChange((value) => {
						settings.depthInfinity = value;
						void saveSettings();
					}),
				);
			},
		},
		{
			desc: translate('chunkedUploadDescription'),
			name: translate('chunkedUpload'),
			render: (setting) => {
				setting.addToggle((toggle) =>
					toggle.setValue(settings.chunkedUpload).onChange((value) => {
						settings.chunkedUpload = value;
						void saveSettings();
					}),
				);
			},
		},
	];
}
