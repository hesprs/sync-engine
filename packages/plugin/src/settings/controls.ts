import type { Settings } from '@';
import type { SettingGroupItem } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import type { CallableOrObjectTree } from '@/modules/Registrar';
import { renderTogglableValue, s } from './utils';

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
}): CallableOrObjectTree {
	const invalidValue = translate('invalidValue');
	return {
		2000: s(
			(self) => ({
				heading: translate('controls'),
				items: Object.values(self).map((node) => node(node) as SettingGroupItem),
				type: 'group',
			}),
			{
				1000: s(() => ({
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
				})),
				2000: s(() => ({
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
				})),
				3000: s(() => ({
					desc: translate('minRequestIntervalDescription'),
					name: translate('minRequestInterval'),
					render: renderTogglableValue({
						field: settings.minRequestInterval,
						invalidValue,
						placeholder: translate('minRequestIntervalPlaceholder'),
						saveSettings,
						type: 'time',
					}),
				})),
				4000: s(() => ({
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
				})),
			},
		),
	};
}
