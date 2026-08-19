import type { Settings } from '@';
import type { App, SettingGroupItem } from 'obsidian';
import type { DatabaseSync } from 'uni-kv';
import { SecretComponent } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import type { CallableOrObjectTree } from '@/modules/Registrar';
import { generateEditableList, reactivelyValidate, s } from './utils';

export type MiscellaneousSettingTranslations = {
	miscellaneous: string;
	diffMatchPatch: string;
	keepLocal: string;
	keepRemote: string;
	skip: string;
	noticeStatusOnMobile: string;
	noticeStatusOnMobileDescription: string;
	confirmTasksInSync: string;
	confirmTasksInSyncDescription: string;
	confirmDeleteInAutoSync: string;
	confirmDeleteInAutoSyncDescription: string;
	customHeaders: string;
	customHeadersDescription: string;
	edit: string;
	xConfigured: string;
	addHeader: string;
	noHeaderConfigured: string;
	headerKeyPlaceholder: string;
	headerValuePlaceholder: string;
	addSecretHeader: string;
};

export default function miscellaneousSettings({
	translate,
	saveSettings,
	settings,
	memoryDB,
	rerenderSettingTab,
	app,
}: {
	translate: Translate<MiscellaneousSettingTranslations>;
	saveSettings: () => Promise<void>;
	settings: Settings;
	memoryDB: DatabaseSync;
	rerenderSettingTab: () => void;
	app: App;
}): CallableOrObjectTree {
	return {
		4000: s(
			(self) => ({
				heading: translate('miscellaneous'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(
					(self) => ({
						desc: translate('customHeadersDescription'),
						displayValue: () =>
							translate('xConfigured', { x: settings.customHeaders.length }),
						items: Object.values(self).map((node) => node(node)),
						name: translate('customHeaders'),
						type: 'page',
					}),
					{
						1000: s(() =>
							generateEditableList({
								defaultValue: { key: '', type: 'plaintext', value: '' },
								extraButtons: [
									(button, list) => {
										button
											.setIcon('key-round')
											.setTooltip(translate('addSecretHeader'))
											.onClick(() => {
												list.push({
													new: true,
													valid: false,
													value: { key: '', type: 'secret', value: '' },
												});
												rerenderSettingTab();
											});
									},
								],
								identifier: 'customHeaders',
								items: settings.customHeaders,
								memoryDB,
								render: (setting, item, save) => {
									setting.addText((text) => {
										text.setValue(item.value.key).setPlaceholder(
											translate('headerKeyPlaceholder'),
										);
										reactivelyValidate<string>({
											immediate: true,
											onSave: (value) => {
												item.value.key = value;
												save();
											},
											parse: (value) => {
												item.value.key = value;
												const trimmed = value.trim();
												if (!trimmed) {
													item.valid = false;
													save();
													return;
												}
												item.valid = true;
												return trimmed;
											},
											text,
										});
										if (item.new) {
											item.new = false;
											text.inputEl.focus();
										}
									});
									if (item.value.type === 'plaintext')
										setting.addText((text) =>
											text
												.setValue(item.value.value)
												.setPlaceholder(translate('headerValuePlaceholder'))
												.inputEl.addEventListener('blur', () => {
													item.value.value = text.getValue().trim();
													text.setValue(item.value.value);
													save();
												}),
										);
									else
										setting.addComponent((element) =>
											new SecretComponent(app, element)
												.setValue(item.value.value)
												.onChange((value) => {
													item.value.value = value ?? '';
													save();
												}),
										);
								},
								rerenderSettingTab,
								saveSettings,
								translations: {
									add: translate('addHeader'),
									empty: translate('noHeaderConfigured'),
								},
							}),
						),
					},
				),
				2000: s(() => ({
					control: { key: 'noticeStatusOnMobile', type: 'toggle' },
					desc: translate('noticeStatusOnMobileDescription'),
					name: translate('noticeStatusOnMobile'),
				})),
				3000: s(() => ({
					control: { key: 'confirmTasksInSync', type: 'toggle' },
					desc: translate('confirmTasksInSyncDescription'),
					name: translate('confirmTasksInSync'),
				})),
				4000: s(() => ({
					control: { key: 'confirmDeleteInAutoSync', type: 'toggle' },
					desc: translate('confirmDeleteInAutoSyncDescription'),
					name: translate('confirmDeleteInAutoSync'),
				})),
			},
		),
	};
}
