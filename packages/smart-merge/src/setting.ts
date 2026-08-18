import type { CallableOrObjectTree, Translate } from '@hesprs/sync-engine-sdk';
import type { SettingGroupItem, TextComponent } from 'obsidian';
import { s } from '@hesprs/sync-engine-sdk';
import type { SmartMergeTranslations } from './i18n';
import type { MergeOptions } from './utils/merge';

export type SmartMergeSettings = MergeOptions;

export default function smartMergeSetting(
	{
		translate,
		saveSettings,
	}: { translate: Translate<SmartMergeTranslations>; saveSettings: () => Promise<void> },
	settings: SmartMergeSettings,
): CallableOrObjectTree {
	const marker =
		(key: keyof SmartMergeSettings, placeholder: string) => (text: TextComponent) => {
			text.setValue(settings[key])
				.setPlaceholder(placeholder)
				.inputEl.addEventListener('blur', () => {
					settings[key] = text.getValue();
					void saveSettings();
				});
		};
	return {
		4048: s(
			(self) => ({
				heading: translate('smartMerge'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(() => ({
					desc: translate('conflictOursMarkersDescription'),
					name: translate('conflictOursMarkers'),
					render: (setting) => {
						setting
							.setClass('sync-engine-togglable-value')
							.addText(marker('conflictAStart', translate('start')))
							.addText(marker('conflictAEnd', translate('end')));
					},
				})),
				2000: s(() => ({
					desc: translate('conflictTheirsMarkersDescription'),
					name: translate('conflictTheirsMarkers'),
					render: (setting) => {
						setting
							.setClass('sync-engine-togglable-value')
							.addText(marker('conflictBStart', translate('start')))
							.addText(marker('conflictBEnd', translate('end')));
					},
				})),
				3000: s(() => ({
					desc: translate('deletionMarkersDescription'),
					name: translate('deletionMarkers'),
					render: (setting) => {
						setting
							.setClass('sync-engine-togglable-value')
							.addText(marker('deletionStart', translate('start')))
							.addText(marker('deletionEnd', translate('end')));
					},
				})),
			},
		),
	};
}
