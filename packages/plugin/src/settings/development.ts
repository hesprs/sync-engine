import type { Settings } from '@';
import type { SettingGroupItem } from 'obsidian';
import type { DatabaseSync } from 'uni-kv';
import { normalizeBaseDir, normalizeUrl } from '@repo/shared/path';
import { Notice } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import type { CallableOrObjectTree } from '@/modules/Registrar';
import type { MaybePromise } from '@/sdk';
import { generateEditableList, reactivelyValidate, s } from './utils';

export type DevelopmentSettingTranslations = {
	development: string;
	clearRecords: string;
	recordsCleared: string;
	clear: string;
	clearRecordsDescription: string;
	export: string;
	exportLogsDescription: string;
	exportLogsDirectoryPlaceholder: string;
	exportLogsToFile: string;
	moduleSources: string;
	moduleSourcesDescription: string;
	edit: string;
	xConfigured: string;
	addSource: string;
	noSourceConfigured: string;
	moduleSourcePlaceholder: string;
};

export default function developmentSettings({
	translate,
	exportLogs,
	deleteRecordStore,
	settings,
	saveSettings,
	memoryDB,
	rerenderSettingTab,
}: {
	translate: Translate<DevelopmentSettingTranslations>;
	deleteRecordStore: (namespace?: string) => MaybePromise<void>;
	exportLogs: () => Promise<void>;
	settings: Settings;
	saveSettings: () => Promise<void>;
	memoryDB: DatabaseSync;
	rerenderSettingTab: () => void;
}): CallableOrObjectTree {
	return {
		5000: s(
			(self) => ({
				heading: translate('development'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(() => ({
					desc: translate('clearRecordsDescription'),
					name: translate('clearRecords'),
					render: (setting) => {
						setting.addButton((button) =>
							button
								.setButtonText(translate('clearRecords'))
								.setDestructive()
								.onClick(async () => {
									await deleteRecordStore();
									new Notice(translate('recordsCleared'));
								}),
						);
					},
				})),
				2000: s(() => ({
					desc: translate('exportLogsDescription'),
					name: translate('exportLogsToFile'),
					render: (setting) => {
						setting
							.addText((text) =>
								text
									.setValue(settings.exportLogsDirectory)
									.setPlaceholder(translate('exportLogsDirectoryPlaceholder'))
									.inputEl.addEventListener('blur', () => {
										const normalized = normalizeBaseDir(text.getValue().trim());
										if (settings.exportLogsDirectory !== normalized) {
											settings.exportLogsDirectory = normalized;
											void saveSettings();
										}
										text.setValue(normalized);
									}),
							)
							.addButton((button) => {
								button.setButtonText(translate('export')).onClick(exportLogs);
							});
					},
				})),
				3000: s(
					(self) => ({
						desc: translate('moduleSourcesDescription'),
						displayValue: () =>
							translate('xConfigured', { x: settings.moduleSources.length }),
						items: Object.values(self).map((node) => node(node)),
						name: translate('moduleSources'),
						type: 'page',
					}),
					{
						1000: s(() =>
							generateEditableList({
								defaultValue: '',
								identifier: 'moduleSources',
								items: settings.moduleSources,
								memoryDB,
								render: (setting, item, save) => {
									setting.addText((text) => {
										text.setPlaceholder(
											translate('moduleSourcePlaceholder'),
										).setValue(item.value);
										reactivelyValidate<string>({
											immediate: true,
											onSave: (value) => {
												item.value = value;
												save();
											},
											parse: (value) => {
												try {
													item.value = value;
													const url = normalizeUrl(value);
													item.valid = true;
													return url;
												} catch {
													if (!item.valid) return;
													item.valid = false;
													save();
												}
											},
											text,
										});
										if (item.new) {
											item.new = false;
											text.inputEl.focus();
										}
									});
								},
								rerenderSettingTab,
								saveSettings,
								translations: {
									add: translate('addSource'),
									empty: translate('noSourceConfigured'),
								},
							}),
						),
					},
				),
			},
		),
	};
}
