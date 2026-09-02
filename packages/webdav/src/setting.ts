import type { WebdavSettings } from '@';
import type { CallableOrObjectTree, LabelDefinition, Translate } from '@hesprs/sync-engine-sdk';
import type { App, SettingGroupItem, TextComponent } from 'obsidian';
import { reactivelyValidate, s } from '@hesprs/sync-engine-sdk';
import { normalizeBaseDir, normalizeUrl } from '@repo/shared/path';
import { SecretComponent } from 'obsidian';

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
		matchLabel,
		speedLabel,
	}: {
		translate: Translate<WebdavTranslations>;
		saveSettings: () => Promise<void>;
		app: App;
		matchLabel: () => LabelDefinition;
		speedLabel: () => LabelDefinition;
	},
	settings: WebdavSettings,
): CallableOrObjectTree {
	const handleInput = <K extends keyof WebdavSettings>(
		text: TextComponent,
		field: K,
		parse: (str: string) => WebdavSettings[K],
		format: (value: WebdavSettings[K]) => string = String,
	) =>
		text.inputEl.addEventListener('blur', () => {
			const parsed = parse(text.getValue());
			text.setValue(format(parsed));
			settings[field] = parsed;
			void saveSettings();
		});
	return {
		749: s(
			(self) => ({
				heading: translate('webdav'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(() => ({
					desc: translate('endpointDescription'),
					name: translate('endpoint'),
					render: (setting) => {
						setting.addText((text) => {
							text.setPlaceholder(translate('endpointPlaceholder')).setValue(
								settings.endpoint,
							);
							reactivelyValidate<string>({
								onSave: (value) => {
									settings.endpoint = value;
									void saveSettings();
								},
								parse: (value) => {
									try {
											return normalizeUrl(value);
									} catch {
											// Return undefined
									}
								},
								text,
							});
						});
					},
				})),
				2000: s(() => ({
					desc: translate('usernameDescription'),
					name: translate('username'),
					render: (setting) => {
						setting.addText((text) =>
							handleInput(
								text
									.setPlaceholder(translate('usernamePlaceholder'))
									.setValue(settings.username),
								'username',
								(str) => str.trim(),
							),
						);
					},
				})),
				3000: s(() => ({
					desc: translate('passwordDescription'),
					name: translate('password'),
					render: (setting) => {
						setting.addComponent((element) =>
							new SecretComponent(app, element)
								.setValue(settings.password)
								.onChange((password) => {
									settings.password = password ?? '';
									void saveSettings();
								}),
						);
					},
				})),
				4000: s(() => ({
					desc: translate('baseDirectoryDescription'),
					labels: [matchLabel()],
					name: translate('baseDirectory'),
					render: (setting) => {
						setting.addText((text) =>
							handleInput(
								text
									.setPlaceholder(translate('baseDirectoryPlaceholder'))
									.setValue(settings.baseDirectory),
								'baseDirectory',
								(str) => normalizeBaseDir(str.trim()),
							),
						);
					},
				})),
				5000: s(() => ({
					desc: translate('depthInfinityDescription'),
					labels: [speedLabel()],
					name: translate('depthInfinity'),
					render: (setting) => {
						setting.addToggle((toggle) =>
							toggle.setValue(settings.depthInfinity).onChange((value) => {
								settings.depthInfinity = value;
								void saveSettings();
							}),
						);
					},
				})),
				6000: s(() => ({
					desc: translate('chunkedUploadDescription'),
					labels: [speedLabel()],
					name: translate('chunkedUpload'),
					render: (setting) => {
						setting.addToggle((toggle) =>
							toggle.setValue(settings.chunkedUpload).onChange((value) => {
								settings.chunkedUpload = value;
								void saveSettings();
							}),
						);
					},
				})),
			},
		),
	};
}
