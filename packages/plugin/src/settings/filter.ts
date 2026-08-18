import type { Settings } from '@';
import type { App, SettingGroupItem } from 'obsidian';
import type { FilterEditorTranslations } from '@/components/FilterEditorModal';
import type { Translate } from '@/modules/I18n';
import type { CallableOrObjectTree } from '@/modules/Registrar';
import FilterEditorModal from '@/components/FilterEditorModal';
import { s } from './utils';

export type FilterSettingTranslations = {
	filterRules: string;
	edit: string;
} & FilterEditorTranslations;

export default function filterSettings({
	translate,
	saveSettings,
	app,
	settings,
}: {
	translate: Translate<FilterSettingTranslations>;
	saveSettings: () => Promise<void>;
	app: App;
	settings: Settings;
}): CallableOrObjectTree {
	return {
		3000: s(
			(self) => ({
				heading: translate('filterRules'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(() => ({
					desc: translate('inclusionRulesDescription'),
					name: translate('inclusionRules'),
					render: (setting) => {
						setting.addButton((button) => {
							button.setButtonText(translate('edit')).onClick(() => {
								new FilterEditorModal(
									(filters) => {
										settings.inclusionRules = filters;
										void saveSettings();
									},
									'include',
									{ app, translate },
									settings.inclusionRules,
								).open();
							});
						});
					},
				})),
				2000: s(() => ({
					desc: translate('exclusionRulesDescription'),
					name: translate('exclusionRules'),
					render: (setting) => {
						setting.addButton((button) => {
							button.setButtonText(translate('edit')).onClick(() => {
								new FilterEditorModal(
									(filters) => {
										settings.exclusionRules = filters;
										void saveSettings();
									},
									'exclude',
									{ app, translate },
									settings.exclusionRules,
								).open();
							});
						});
					},
				})),
			},
		),
	};
}
