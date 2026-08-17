import type { Translate } from '@hesprs/sync-engine-sdk';
import type { SettingDefinitionItem, TextComponent } from 'obsidian';
import type { SmartMergeTranslations } from './i18n';
import type { MergeOptions } from './utils/merge';

export type SmartMergeSettings = MergeOptions;

export default function smartMergeSetting(
	{
		translate,
		saveSettings,
	}: { translate: Translate<SmartMergeTranslations>; saveSettings: () => Promise<void> },
	settings: SmartMergeSettings,
): Array<SettingDefinitionItem> {
	const marker =
		(key: keyof SmartMergeSettings, placeholder: string) => (text: TextComponent) => {
			text.setValue(settings[key])
				.setPlaceholder(placeholder)
				.onChange((value: string) => {
					settings[key] = value;
					void saveSettings();
				});
		};
	return [
		{
			name: translate('smartMerge'),
			render: (setting) => {
				setting.setHeading();
			},
		},
		{
			desc: translate('conflictOursMarkersDescription'),
			name: translate('conflictOursMarkers'),
			render: (setting) => {
				setting
					.addText(marker('conflictAStart', translate('start')))
					.addText(marker('conflictAEnd', translate('end')));
			},
		},
		{
			desc: translate('conflictTheirsMarkersDescription'),
			name: translate('conflictTheirsMarkers'),
			render: (setting) => {
				setting
					.addText(marker('conflictBStart', translate('start')))
					.addText(marker('conflictBEnd', translate('end')));
			},
		},
		{
			desc: translate('deletionMarkersDescription'),
			name: translate('deletionMarkers'),
			render: (setting) => {
				setting
					.addText(marker('deletionStart', translate('start')))
					.addText(marker('deletionEnd', translate('end')));
			},
		},
	];
}
