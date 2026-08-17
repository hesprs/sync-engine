import type { Settings } from '@';
import type { App, SettingDefinitionItem } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import HeadersEditorModal from '@/components/HeadersEditorModal';
import { heading } from './utils';

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
};

export default function miscellaneousSettings({
	translate,
	saveSettings,
	settings,
	app,
}: {
	translate: Translate<MiscellaneousSettingTranslations>;
	saveSettings: () => Promise<void>;
	settings: Settings;
	app: App;
}): Array<SettingDefinitionItem> {
	return [
		heading(translate('miscellaneous')),
		{
			desc: translate('customHeadersDescription'),
			name: translate('customHeaders'),
			render: (setting) => {
				setting.addButton((button) => {
					button.setButtonText(translate('edit')).onClick(() => {
						new HeadersEditorModal(
							(headers) => {
								settings.customHeaders = headers;
								void saveSettings();
							},
							{ app, translate },
							settings.customHeaders,
						).open();
					});
				});
			},
		},
		{
			control: { key: 'noticeStatusOnMobile', type: 'toggle' },
			desc: translate('noticeStatusOnMobileDescription'),
			name: translate('noticeStatusOnMobile'),
		},
		{
			control: { key: 'confirmTasksInSync', type: 'toggle' },
			desc: translate('confirmTasksInSyncDescription'),
			name: translate('confirmTasksInSync'),
		},
		{
			control: { key: 'confirmDeleteInAutoSync', type: 'toggle' },
			desc: translate('confirmDeleteInAutoSyncDescription'),
			name: translate('confirmDeleteInAutoSync'),
		},
	];
}
