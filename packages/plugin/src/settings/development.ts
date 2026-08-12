import type { Settings } from '@';
import { normalizeBaseDir } from '@repo/shared/path';
import { Notice, Setting } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import type { MaybePromise } from '@/sdk';

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
};

export default function developmentSettings(
	el: HTMLElement,
	ctx: {
		translate: Translate<DevelopmentSettingTranslations>;
		deleteRecordStore: (namespace?: string) => MaybePromise<void>;
		exportLogs: () => Promise<void>;
		settings: Settings;
		saveSettings: () => Promise<void>;
	},
) {
	const { translate, exportLogs, deleteRecordStore, settings, saveSettings } = ctx;
	new Setting(el).setName(translate('development')).setHeading();

	new Setting(el)
		.setName(translate('clearRecords'))
		.setDesc(translate('clearRecordsDescription'))
		.addButton((button) =>
			button
				.setButtonText(translate('clearRecords'))
				.setWarning()
				.onClick(async () => {
					await deleteRecordStore();
					new Notice(translate('recordsCleared'));
				}),
		);

	new Setting(el)
		.setName(translate('exportLogsToFile'))
		.setDesc(translate('exportLogsDescription'))
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
}
