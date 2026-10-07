import type { WebdavSettings } from '@';
import type {
	CallableOrObjectTree,
	Fragment,
	LabelDefinition,
	Translate,
} from '@hesprs/sync-engine-sdk';
import type { App, Setting, SettingGroupItem, TextComponent } from 'obsidian';
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
	capabilities: string;
	capabilitiesDescription: string;
	depthInfinity: string;
	depthInfinityDescription: Fragment;
	chunkedUpload: string;
	chunkedUploadDescription: Fragment;
	fileMetadata: string;
	fileMetadataDescription: Fragment;
	pleaseConfigureAccount: string;
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
	const capabilityToggle =
		(capability: 'depthInfinity' | 'chunkedUpload' | 'fileMetadata') => (setting: Setting) => {
			setting
				.addToggle((toggle) =>
					toggle.setValue(settings[capability]).onChange((value) => {
						settings[capability] = value;
						void saveSettings();
					}),
				)
				.settingEl.addClass('sync-engine-setting-rendered-desc');
		};
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
				5000: s(
					(self) => ({
						desc: translate('capabilitiesDescription'),
						items: Object.values(self).map((node) => node(node)),
						labels: [speedLabel()],
						name: translate('capabilities'),
						type: 'page',
					}),
					{
						1000: s(() => ({
							desc: translate('depthInfinityDescription'),
							labels: [speedLabel()],
							name: translate('depthInfinity'),
							render: capabilityToggle('depthInfinity'),
						})),
						2000: s(() => ({
							desc: translate('chunkedUploadDescription'),
							labels: [speedLabel()],
							name: translate('chunkedUpload'),
							render: capabilityToggle('chunkedUpload'),
						})),
						3000: s(() => ({
							desc: translate('fileMetadataDescription'),
							name: translate('fileMetadata'),
							render: capabilityToggle('fileMetadata'),
						})),
					},
				),
			},
		),
	};
}
