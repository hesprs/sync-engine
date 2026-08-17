import type { Settings, Context } from '@';
import type { SettingDefinitionItem } from 'obsidian';
import type { MigrationModalTranslations } from '@/components/MigrationModal';
import type { Fragment, Translate } from '@/modules/I18n';
import type { MaybePromise } from '@/sdk';
import setNeedMigration from '@/components/MigrationModal';
import { heading, renderTogglableValue } from './utils';

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
	invalidValue: string;
} & MigrationModalTranslations;

export default function featuresSettings(ctx: {
	translate: Translate<FeaturesSettingTranslations>;
	saveSettings: () => Promise<void>;
	startScheduledSync: () => void;
	stopScheduledSync: () => void;
	settings: Settings;
	recordStoreExists: () => MaybePromise<boolean>;
}): Array<SettingDefinitionItem> {
	const {
		translate,
		saveSettings,
		startScheduledSync,
		stopScheduledSync,
		settings,
		recordStoreExists,
	} = ctx;
	const invalidValue = translate('invalidValue');
	return [
		heading(translate('features')),
		{
			desc: translate('realtimeSyncDescription'),
			name: translate('realtimeSync'),
			render: renderTogglableValue({
				field: settings.realtimeSync,
				invalidValue,
				placeholder: translate('realtimeSyncPlaceholder'),
				saveSettings,
				type: 'time',
			}),
		},
		{
			desc: translate('startupSyncDescription'),
			name: translate('startupSync'),
			render: renderTogglableValue({
				field: settings.startupSync,
				invalidValue,
				placeholder: translate('startupSyncPlaceholder'),
				saveSettings,
				type: 'time',
			}),
		},
		{
			desc: translate('scheduledSyncDescription'),
			name: translate('scheduledSync'),
			render: renderTogglableValue({
				field: settings.scheduledSync,
				invalidValue,
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
		},
		{
			control: { key: 'realtimeSyncFastMode', type: 'toggle' },
			desc: translate('realtimeSyncFastModeDescription'),
			name: translate('realtimeSyncFastMode'),
		},
		{
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
							translate('asymmetricStorageMigration', value ? 'enable' : 'disable'),
						needMigration: recordStoreExists,
						toggle: toggle.setValue(settings.asymmetricStorage),
					}),
				);
			},
		},
	];
}
