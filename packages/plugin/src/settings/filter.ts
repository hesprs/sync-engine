import type { Settings } from '@';
import type { App, SettingDefinitionItem } from 'obsidian';
import type { FilterEditorTranslations } from '@/components/FilterEditorModal';
import type { Translate } from '@/modules/I18n';
import FilterEditorModal from '@/components/FilterEditorModal';
import { heading } from './utils';

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
}): Array<SettingDefinitionItem> {
	return [
		heading(translate('filterRules')),
		{
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
		},
		{
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
		},
	];
}
