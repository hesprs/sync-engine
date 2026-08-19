import type { Settings, Context } from '@';
import type { SettingGroupItem } from 'obsidian';
import type { MigrationModalTranslations } from '@/components/MigrationModal';
import type { Fragment, Translate } from '@/modules/I18n';
import type { CallableOrObjectTree } from '@/modules/Registrar';
import type { MaybePromise } from '@/sdk';
import setNeedMigration from '@/components/MigrationModal';
import { renderTogglableValue, s } from './utils';

export type FeaturesSettingTranslations = {
	features: string;
	realtimeSyncFastMode: string;
	realtimeSyncFastModeDescription: string;
	realtimeSync: string;
	realtimeSyncDescription: string;
	realtimeSyncPlaceholder: string;
	startupSync: string;
	startupSyncDescription: string;
	startupSyncPlaceholder: string;
	scheduledSync: string;
	scheduledSyncDescription: string;
	scheduledSyncPlaceholder: string;
	asymmetricStorage: string;
	asymmetricStorageDescription: Fragment;
	asymmetricStorageMigration: Fragment<'enable' | 'disable'>;
} & MigrationModalTranslations;

export default function featuresSettings(ctx: {
	translate: Translate<FeaturesSettingTranslations>;
	saveSettings: () => Promise<void>;
	startScheduledSync: () => void;
	stopScheduledSync: () => void;
	settings: Settings;
	recordStoreExists: () => MaybePromise<boolean>;
}): CallableOrObjectTree {
	const {
		translate,
		saveSettings,
		startScheduledSync,
		stopScheduledSync,
		settings,
		recordStoreExists,
	} = ctx;
	return {
		1000: s(
			(self) => ({
				heading: translate('features'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(() => ({
					desc: translate('realtimeSyncDescription'),
					name: translate('realtimeSync'),
					render: renderTogglableValue({
						field: settings.realtimeSync,
						placeholder: translate('realtimeSyncPlaceholder'),
						saveSettings,
						type: 'time',
					}),
				})),
				2000: s(() => ({
					desc: translate('startupSyncDescription'),
					name: translate('startupSync'),
					render: renderTogglableValue({
						field: settings.startupSync,
						placeholder: translate('startupSyncPlaceholder'),
						saveSettings,
						type: 'time',
					}),
				})),
				3000: s(() => ({
					desc: translate('scheduledSyncDescription'),
					name: translate('scheduledSync'),
					render: renderTogglableValue({
						field: settings.scheduledSync,
						onChange: () => {
							stopScheduledSync();
							startScheduledSync();
						},
						onToggle: (enabled) => {
							if (enabled) startScheduledSync();
							else stopScheduledSync();
						},
						placeholder: translate('scheduledSyncPlaceholder'),
						rejectZero: true,
						saveSettings,
						type: 'time',
					}),
				})),
				4000: s(() => ({
					control: { key: 'realtimeSyncFastMode', type: 'toggle' },
					desc: translate('realtimeSyncFastModeDescription'),
					name: translate('realtimeSyncFastMode'),
				})),
				5000: s(() => ({
					desc: translate('asymmetricStorageDescription'),
					name: translate('asymmetricStorage'),
					render: (setting) => {
						setting.addToggle((toggle) =>
							setNeedMigration(ctx as Context, {
								apply: (value) => {
									settings.asymmetricStorage = value;
									void saveSettings();
								},
								content: (value) =>
									translate(
										'asymmetricStorageMigration',
										value ? 'enable' : 'disable',
									),
								needMigration: () => recordStoreExists(),
								toggle: toggle.setValue(settings.asymmetricStorage),
							}),
						);
					},
				})),
			},
		),
	};
}
