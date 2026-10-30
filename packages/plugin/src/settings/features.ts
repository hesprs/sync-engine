import { renderTogglableValue, s } from './utils';
import setNeedMigration from '@/components/MigrationModal';
import type { LabelDefinition } from './utils';
import type { Settings, Context } from '@';
import type { MigrationModalTranslations } from '@/components/MigrationModal';
import type { Fragment, Translate } from '@/modules/I18n';
import type { CallableOrObjectTree } from '@/modules/Setting';
import type { MaybePromise } from '@/types';
import type { SettingGroupItem } from 'obsidian';

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
	focusSync: string;
	focusSyncDescription: string;
	focusSyncPlaceholder: string;
	asymmetricStorage: string;
	asymmetricStorageDescription: Fragment;
	asymmetricStorageMigration: Fragment<boolean>;
} & MigrationModalTranslations;

export default function featuresSettings(ctx: {
	translate: Translate<FeaturesSettingTranslations>;
	saveSettings: () => Promise<void>;
	startScheduledSync: () => void;
	stopScheduledSync: () => void;
	settings: Settings;
	recordStoreExists: () => MaybePromise<boolean>;
	matchLabel: () => LabelDefinition;
	speedLabel: () => LabelDefinition;
}): CallableOrObjectTree {
	const {
		translate,
		saveSettings,
		startScheduledSync,
		stopScheduledSync,
		settings,
		recordStoreExists,
		matchLabel,
		speedLabel,
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
				3500: s(() => ({
					desc: translate('focusSyncDescription'),
					name: translate('focusSync'),
					render: renderTogglableValue({
						field: settings.focusSync,
						placeholder: translate('focusSyncPlaceholder'),
						saveSettings,
						type: 'time',
					}),
				})),
				4000: s(() => ({
					control: { key: 'realtimeSyncFastMode', type: 'toggle' },
					desc: translate('realtimeSyncFastModeDescription'),
					labels: [speedLabel()],
					name: translate('realtimeSyncFastMode'),
				})),
				5000: s(() => ({
					desc: translate('asymmetricStorageDescription'),
					labels: [matchLabel(), speedLabel()],
					name: translate('asymmetricStorage'),
					render: (setting) => {
						setting.addToggle((toggle) =>
							setNeedMigration(ctx as Context, {
								apply: (value) => {
									settings.asymmetricStorage = value;
									void saveSettings();
								},
								content: (value) => translate('asymmetricStorageMigration', value),
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
