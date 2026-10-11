import type { CallableOrObjectTree, Translate } from '@hesprs/sync-engine-sdk';
import type { SettingGroupItem } from 'obsidian';
import { s } from '@hesprs/sync-engine-sdk';

export type MetadataSettings = { preferMetadataMtime: boolean };
export type MetadataTranslations = {
	s3Rclone: string;
	s3RclonePreferMetadataMtime: string;
	s3RclonePreferMetadataMtimeDescription: string;
};

export default function metadataSetting(
	ctx: { translate: Translate<MetadataTranslations>; saveSettings: () => Promise<void> },
	settings: MetadataSettings,
): CallableOrObjectTree {
	return {
		4002: s(
			(self) => ({
				heading: ctx.translate('s3Rclone'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(() => ({
					desc: ctx.translate('s3RclonePreferMetadataMtimeDescription'),
					name: ctx.translate('s3RclonePreferMetadataMtime'),
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
