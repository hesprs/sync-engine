import type { S3Settings } from '@';
import type { Fragment, Translate, Translations } from '@hesprs/sync-engine-sdk';
import { normalizeBaseDir, normalizeUrl } from '@repo/shared/path';
import { App, Notice, SecretComponent, Setting } from 'obsidian';
import type { UrlStyle } from './s3/sigv4';
import handleInput from './handle-input';

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
	el: HTMLElement,
	ctx: {
		translate: Translate<S3Translations & Translations>;
		saveSettings: () => Promise<void>;
		app: App;
	},
	settings: S3Settings,
) {
	const { translate, saveSettings, app } = ctx;
	const invalidValue = translate('invalidValue');
	new Setting(el).setName(translate('s3')).setHeading();

	new Setting(el)
		.setName(translate('endpoint'))
		.setDesc(translate('endpointDescription'))
		.addText((text) => {
			text.setPlaceholder(translate('endpointPlaceholder')).setValue(settings.endpoint);
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

	new Setting(el)
		.setName(translate('region'))
		.setDesc(translate('regionDescription'))
		.addText((text) => {
			text.setPlaceholder(translate('regionPlaceholder')).setValue(settings.region);
			handleInput({
				invalidValue,
				key: 'region',
				processValue: (value) => value.trim(),
				saveSettings,
				settings,
				text,
			});
		});

	new Setting(el)
		.setName(translate('accessKeyId'))
		.setDesc(translate('accessKeyIdDescription'))
		.addText((text) => {
			text.setPlaceholder(translate('accessKeyIdPlaceholder')).setValue(settings.accessKeyId);
			handleInput({
				invalidValue,
				key: 'accessKeyId',
				processValue: (value) => value.trim(),
				saveSettings,
				settings,
				text,
			});
		});

	new Setting(el)
		.setName(translate('secretAccessKey'))
		.setDesc(translate('secretAccessKeyDescription'))
		.addComponent((element) =>
			new SecretComponent(app, element)
				.setValue(settings.secretAccessKey)
				.onChange((value) => {
					settings.secretAccessKey = value;
					void saveSettings();
				}),
		);

	new Setting(el)
		.setName(translate('sessionToken'))
		.setDesc(translate('sessionTokenDescription'))
		.addComponent((element) =>
			new SecretComponent(app, element).setValue(settings.sessionToken).onChange((value) => {
				settings.sessionToken = value;
				void saveSettings();
			}),
		);

	new Setting(el)
		.setName(translate('bucket'))
		.setDesc(translate('bucketDescription'))
		.addText((text) => {
			text.setPlaceholder(translate('bucketPlaceholder')).setValue(settings.bucket);
			handleInput({
				invalidValue,
				key: 'bucket',
				processValue: (value) => value.trim(),
				saveSettings,
				settings,
				text,
			});
		});

	new Setting(el)
		.setName(translate('urlStyle'))
		.setDesc(translate('urlStyleDescription'))
		.addDropdown((dropdown) => {
			dropdown
				.addOption('virtualHosted', translate('urlStyleVirtualHosted'))
				.addOption('path', translate('urlStylePath'))
				.setValue(settings.urlStyle)
				.onChange((value) => {
					settings.urlStyle = value as UrlStyle;
					void saveSettings();
				});
		});

	new Setting(el)
		.setName(translate('prefix'))
		.setDesc(translate('prefixDescription'))
		.addText((text) => {
			text.setPlaceholder(translate('prefixPlaceholder')).setValue(settings.prefix);
			handleInput({
				invalidValue,
				key: 'prefix',
				processValue: (original) => normalizeBaseDir(original.trim()),
				saveSettings,
				settings,
				text,
			});
		});

	new Setting(el)
		.setName(translate('proxyUrl'))
		.setDesc(translate('proxyUrlDescription'))
		.addText((text) => {
			text.setPlaceholder(translate('proxyUrlPlaceholder'))
				.setValue(settings.proxyUrl.value)
				.inputEl.addEventListener('blur', () => {
					const original = settings.proxyUrl.value;
					try {
						settings.proxyUrl.value = normalizeUrl(text.getValue());
					} catch {
						new Notice(translate('invalidValue'));
						settings.proxyUrl.value = original;
					}
					text.setValue(settings.proxyUrl.value);
				});
		})
		.addToggle((toggle) =>
			toggle.setValue(settings.proxyUrl.enabled).onChange((value) => {
				settings.proxyUrl.enabled = value;
				void saveSettings();
			}),
		);
}
