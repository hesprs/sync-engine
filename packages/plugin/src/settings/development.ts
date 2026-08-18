import type { Settings } from '@';
import type {
	App,
	SettingDefinitionGroup,
	SettingDefinitionItem,
	SettingGroupItem,
} from 'obsidian';
import { normalizeBaseDir } from '@repo/shared/path';
import { Notice } from 'obsidian';
import type { SourceEditorTranslations } from '@/components/SourceEditorModal';
import type { Translate } from '@/modules/I18n';
import type { CallableOrObjectTree } from '@/modules/Registrar';
import type { MaybePromise } from '@/sdk';
import ModuleSourceEditorModal from '@/components/SourceEditorModal';
import { s } from './utils';

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
	xSources: string;
	addSource: string;
} & SourceEditorTranslations;

export default function developmentSettings({
	translate,
	exportLogs,
	deleteRecordStore,
	settings,
	saveSettings,
	app,
}: {
	translate: Translate<DevelopmentSettingTranslations>;
	deleteRecordStore: (namespace?: string) => MaybePromise<void>;
	exportLogs: () => Promise<void>;
	settings: Settings;
	saveSettings: () => Promise<void>;
	app: App;
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
				3000: s(() => ({
					desc: translate('moduleSourcesDescription'),
					name: translate('moduleSources'),
					render: (setting) => {
						setting.addButton((button) => {
							button.setButtonText(translate('edit')).onClick(() =>
								new ModuleSourceEditorModal(
									(sources) => {
										settings.moduleSources = sources;
										void saveSettings();
									},
									{ app, translate },
									settings.moduleSources,
								).open(),
							);
						});
					},
				})),
				4000: s(
					(self) => ({
						desc: translate('moduleSourcesDescription'),
						displayValue: translate('xSources', { x: settings.moduleSources.length }),
						items: Object.values(self).map((node) => node(node)),
						name: translate('moduleSources'),
						type: 'page',
					}),
					{
						1000: s(() => ({
							addItem: {
								action: () => {},
								name: translate('addSource'),
							},
							items: settings.moduleSources.map(generateEditableItem),
							type: 'list',
						})),
					},
				),
			},
		),
	};
}

function generateEditableItem(source: string): SettingGroupItem {
	return {
		name: '',
		render: (setting) => {},
		searchable: false,
	};
}
