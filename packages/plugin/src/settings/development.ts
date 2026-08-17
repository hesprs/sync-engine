import type { Settings } from '@';
import type { App, SettingDefinitionItem } from 'obsidian';
import { normalizeBaseDir } from '@repo/shared/path';
import { Notice } from 'obsidian';
import type { SourceEditorTranslations } from '@/components/SourceEditorModal';
import type { Translate } from '@/modules/I18n';
import type { MaybePromise } from '@/sdk';
import ModuleSourceEditorModal from '@/components/SourceEditorModal';
import { heading } from './utils';

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
	noSourceConfigured: string;
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
}): Array<SettingDefinitionItem> {
	return [
		heading(translate('development')),
		{
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
		},
		{
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
		},
		{
			desc: translate('moduleSourcesDescription'),
			emptyState: translate('noSourceConfigured'),
			items: settings.moduleSources.map((source) => ({
				name: source,
			})),
			name: translate('moduleSources'),
			type: 'list',
		},
	];
}

/*
Render: (setting) => {
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
*/
