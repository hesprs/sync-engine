import type { S3Settings } from '@';
import type {
	CallableOrObjectTree,
	Fragment,
	LabelDefinition,
	Translate,
	Translations,
} from '@hesprs/sync-engine-sdk';
import type { App, SettingGroupItem, TextComponent } from 'obsidian';
import { reactivelyValidate, s } from '@hesprs/sync-engine-sdk';
import { normalizeBaseDir, normalizeUrl } from '@repo/shared/path';
import { SecretComponent } from 'obsidian';
import type { UrlStyle } from './s3/sigv4';

export type S3Translations = {
	s3: string;
	endpoint: string;
	endpointDescription: string;
	endpointPlaceholder: string;
	region: string;
	regionDescription: string;
	regionPlaceholder: string;
	accessKeyId: string;
	accessKeyIdDescription: string;
	accessKeyIdPlaceholder: string;
	secretAccessKey: string;
	secretAccessKeyDescription: string;
	sessionToken: string;
	sessionTokenDescription: string;
	bucket: string;
	bucketDescription: string;
	bucketPlaceholder: string;
	urlStyle: string;
	urlStyleDescription: Fragment;
	urlStyleVirtualHosted: string;
	urlStylePath: string;
	prefix: string;
	prefixDescription: string;
	prefixPlaceholder: string;
	proxyUrl: string;
	proxyUrlDescription: string;
	proxyUrlPlaceholder: string;
};

export default function s3Setting(
	{
		translate,
		saveSettings,
		app,
		matchLabel,
	}: {
		translate: Translate<S3Translations & Translations>;
		saveSettings: () => Promise<void>;
		app: App;
		matchLabel: () => LabelDefinition;
	},
	settings: S3Settings,
): CallableOrObjectTree {
	const handleInput = <K extends keyof S3Settings>(
		text: TextComponent,
		field: K,
		parse: (str: string) => S3Settings[K],
		format: (value: S3Settings[K]) => string = String,
	) =>
		text.inputEl.addEventListener('blur', () => {
			const parsed = parse(text.getValue());
			text.setValue(format(parsed));
			settings[field] = parsed;
			void saveSettings();
		});
	return {
		604: s(
			(self) => ({
				heading: translate('s3'),
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
										normalizeUrl(value);
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
					desc: translate('regionDescription'),
					name: translate('region'),
					render: (setting) => {
						setting.addText((text) =>
							handleInput(
								text
									.setPlaceholder(translate('regionPlaceholder'))
									.setValue(settings.region),
								'region',
								(str) => str.trim(),
							),
						);
					},
				})),
				3000: s(() => ({
					desc: translate('accessKeyIdDescription'),
					name: translate('accessKeyId'),
					render: (setting) => {
						setting.addText((text) =>
							handleInput(
								text
									.setPlaceholder(translate('accessKeyIdPlaceholder'))
									.setValue(settings.accessKeyId),
								'accessKeyId',
								(str) => str.trim(),
							),
						);
					},
				})),
				4000: s(() => ({
					desc: translate('secretAccessKeyDescription'),
					name: translate('secretAccessKey'),
					render: (setting) => {
						setting.addComponent((element) =>
							new SecretComponent(app, element)
								.setValue(settings.secretAccessKey)
								.onChange((value) => {
									settings.secretAccessKey = value ?? '';
									void saveSettings();
								}),
						);
					},
				})),
				5000: s(() => ({
					desc: translate('sessionTokenDescription'),
					name: translate('sessionToken'),
					render: (setting) => {
						setting
							.addComponent((element) =>
								new SecretComponent(app, element)
									.setValue(settings.sessionToken.value)
									.onChange((value) => {
										settings.sessionToken.value = value ?? '';
										void saveSettings();
									}),
							)
							.addToggle((toggle) =>
								toggle.setValue(settings.sessionToken.enabled).onChange((value) => {
									settings.sessionToken.enabled = value;
									void saveSettings();
								}),
							);
					},
				})),
				6000: s(() => ({
					desc: translate('bucketDescription'),
					labels: [matchLabel()],
					name: translate('bucket'),
					render: (setting) => {
						setting.addText((text) =>
							handleInput(
								text
									.setPlaceholder(translate('bucketPlaceholder'))
									.setValue(settings.bucket),
								'bucket',
								(str) => str.trim(),
							),
						);
					},
				})),
				7000: s(() => ({
					desc: translate('urlStyleDescription'),
					name: translate('urlStyle'),
					render: (setting) => {
						setting.addDropdown((dropdown) =>
							dropdown
								.addOption('virtualHosted', translate('urlStyleVirtualHosted'))
								.addOption('path', translate('urlStylePath'))
								.setValue(settings.urlStyle)
								.onChange((value) => {
									settings.urlStyle = value as UrlStyle;
									void saveSettings();
								}),
						);
					},
				})),
				8000: s(() => ({
					desc: translate('prefixDescription'),
					labels: [matchLabel()],
					name: translate('prefix'),
					render: (setting) => {
						setting.addText((text) =>
							handleInput(
								text
									.setPlaceholder(translate('prefixPlaceholder'))
									.setValue(settings.prefix),
								'prefix',
								(str) => normalizeBaseDir(str.trim()),
							),
						);
					},
				})),
				9000: s(() => ({
					desc: translate('proxyUrlDescription'),
					name: translate('proxyUrl'),
					render: (setting) => {
						setting
							.addText((text) => {
								text.setPlaceholder(translate('proxyUrlPlaceholder')).setValue(
									settings.proxyUrl.value,
								);
								reactivelyValidate<string>({
									onSave: (value) => {
										settings.proxyUrl.value = value;
										void saveSettings();
									},
									parse: (value) => {
										if (!value.trim()) return '';
										try {
											return normalizeUrl(value);
										} catch {
											// Return undefined
										}
									},
									text,
								});
							})
							.addToggle((toggle) =>
								toggle.setValue(settings.proxyUrl.enabled).onChange((value) => {
									settings.proxyUrl.enabled = value;
									void saveSettings();
								}),
							);
					},
				})),
			},
		),
	};
}
