import type { CallableOrObjectTree, Translate } from '@hesprs/sync-engine-sdk';
import type { SettingGroupItem } from 'obsidian';
import { s } from '@hesprs/sync-engine-sdk';

export type MetadataSettings = { preferMetadataMtime: boolean };
export type MetadataTranslations = {
	openListFileMetadata: string;
	openListPreferMetadataMtime: string;
	openListPreferMetadataMtimeDescription: string;
};

export default function metadataSetting(
	ctx: { translate: Translate<MetadataTranslations>; saveSettings: () => Promise<void> },
	settings: MetadataSettings,
): CallableOrObjectTree {
	return {
		4001: s(
			(self) => ({
				heading: ctx.translate('openListFileMetadata'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(() => ({
					desc: ctx.translate('openListPreferMetadataMtimeDescription'),
					name: ctx.translate('openListPreferMetadataMtime'),
					render: (setting) => {
						setting.addToggle((toggle) =>
							toggle.setValue(settings.preferMetadataMtime).onChange((value) => {
								settings.preferMetadataMtime = value;
								void ctx.saveSettings();
							}),
						);
					},
				})),
			},
		),
	};
}
