import { settingEntry as s } from '@hesprs/sync-engine-sdk';
import { Notice } from 'obsidian';
import type { HistoryTranslations } from '@/i18n';
import type { CallableOrObjectTree, Translate } from '@hesprs/sync-engine-sdk';
import type { SettingGroupItem } from 'obsidian';

export type HistorySettings = {
	autoGc?: boolean;
	deviceId?: string;
	lastGcTime?: number;
	maxVersions: number;
	protectExcludedNotes?: boolean;
	retentionDays: number;
	trackAttachments?: boolean;
};

export type HistorySettingActions = { runGc: () => Promise<number> };

export default function historySetting(
	{
		saveSettings,
		translate,
	}: { saveSettings: () => Promise<void>; translate: Translate<HistoryTranslations> },
	settings: HistorySettings,
	actions: HistorySettingActions,
): CallableOrObjectTree {
	return {
		3055: s(
			(self) => ({
				heading: translate('history'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(() => ({
					desc: translate('retentionDaysDescription'),
					name: translate('retentionDays'),
					render: (setting) => {
						setting.addText((text) => {
							text.setValue(String(settings.retentionDays)).onChange((value) => {
								const parsed = Number(value);
								if (Number.isFinite(parsed) && parsed >= 0)
									settings.retentionDays = parsed;
								void saveSettings();
							});
						});
					},
				})),
				2000: s(() => ({
					desc: translate('maxVersionsDescription'),
					name: translate('maxVersions'),
					render: (setting) => {
						setting.addText((text) => {
							text.setValue(String(settings.maxVersions)).onChange((value) => {
								const parsed = Number(value);
								if (Number.isFinite(parsed) && parsed >= 0)
									settings.maxVersions = parsed;
								void saveSettings();
							});
						});
					},
				})),
				2500: s(() => ({
					desc: translate('autoGcDescription'),
					name: translate('autoGc'),
					render: (setting) => {
						setting.addToggle((toggle) => {
							toggle.setValue(settings.autoGc !== false).onChange((value) => {
								settings.autoGc = value;
								void saveSettings();
							});
						});
					},
				})),
				2600: s(() => ({
					desc: translate('protectExcludedNotesDescription'),
					name: translate('protectExcludedNotes'),
					render: (setting) => {
						setting.addToggle((toggle) => {
							toggle
								.setValue(settings.protectExcludedNotes === true)
								.onChange((value) => {
									settings.protectExcludedNotes = value;
									void saveSettings();
								});
						});
					},
				})),
				2700: s(() => ({
					desc: translate('trackAttachmentsDescription'),
					name: translate('trackAttachments'),
					render: (setting) => {
						setting.addToggle((toggle) => {
							toggle
								.setValue(settings.trackAttachments === true)
								.onChange((value) => {
									settings.trackAttachments = value;
									void saveSettings();
								});
						});
					},
				})),
				3000: s(() => ({
					desc: translate('gcDescription'),
					name: translate('gc'),
					render: (setting) => {
						setting.addButton((button) =>
							button.setButtonText(translate('runGc')).onClick(() => {
								void actions
									.runGc()
									.then((count) => new Notice(translate('gcDone', count)))
									.catch(
										(error: unknown) =>
											new Notice(translate('restoreFailed', String(error))),
									);
							}),
						);
					},
				})),
			},
		),
	};
}
