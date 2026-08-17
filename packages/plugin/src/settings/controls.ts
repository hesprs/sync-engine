import type { Settings } from '@';
import type { SettingDefinitionItem } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import { heading, renderTogglableValue } from './utils';

export type ControlsSettingTranslations = {
	controls: string;
	maxFileSize: string;
	maxFileSizeDescription: string;
	maxFileSizePlaceholder: string;
	maxRequestConcurrency: string;
	minRequestInterval: string;
	minRequestIntervalDescription: string;
	minRequestIntervalPlaceholder: string;
	maxRequestConcurrencyPlaceholder: string;
	maxRequestConcurrencyDescription: string;
	maxMemoryConsumption: string;
	maxMemoryConsumptionDescription: string;
	maxMemoryConsumptionPlaceholder: string;
	invalidValue: string;
};

export default function controlsSettings({
	translate,
	saveSettings,
	settings,
}: {
	translate: Translate<ControlsSettingTranslations>;
	saveSettings: () => Promise<void>;
	settings: Settings;
}): Array<SettingDefinitionItem> {
	const invalidValue = translate('invalidValue');
	return [
		heading(translate('controls')),
		{
			desc: translate('maxFileSizeDescription'),
			name: translate('maxFileSize'),
			render: renderTogglableValue({
				field: settings.maxFileSize,
				invalidValue,
				placeholder: translate('maxFileSizePlaceholder'),
				rejectZero: true,
				saveSettings,
				type: 'fileSize',
			}),
		},
		{
			desc: translate('maxRequestConcurrencyDescription'),
			name: translate('maxRequestConcurrency'),
			render: renderTogglableValue({
				field: settings.maxRequestConcurrency,
				invalidValue,
				placeholder: translate('maxRequestConcurrencyPlaceholder'),
				rejectZero: true,
				saveSettings,
				type: 'number',
			}),
		},
		{
			desc: translate('minRequestIntervalDescription'),
			name: translate('minRequestInterval'),
			render: renderTogglableValue({
				field: settings.minRequestInterval,
				invalidValue,
				placeholder: translate('minRequestIntervalPlaceholder'),
				saveSettings,
				type: 'time',
			}),
		},
		{
			desc: translate('maxMemoryConsumptionDescription'),
			name: translate('maxMemoryConsumption'),
			render: renderTogglableValue({
				field: settings.maxMemoryConsumption,
				invalidValue,
				placeholder: translate('maxMemoryConsumptionPlaceholder'),
				rejectZero: true,
				saveSettings,
				type: 'fileSize',
			}),
		},
	];
}
