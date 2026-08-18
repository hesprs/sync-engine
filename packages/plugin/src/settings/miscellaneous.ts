import type { Settings } from '@';
import type { App, SettingGroupItem } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import type { CallableOrObjectTree } from '@/modules/Registrar';
import HeadersEditorModal from '@/components/HeadersEditorModal';
import { s } from './utils';

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
}): CallableOrObjectTree {
	return {
		4000: s(
			(self) => ({
				heading: translate('miscellaneous'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(() => ({
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
				})),
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
