import type { Settings } from '@';
import type { SettingGroupItem } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import type { CallableOrObjectTree } from '@/modules/Setting';
import type { LabelDefinition } from './utils';
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
};

export default function controlsSettings({
	translate,
	saveSettings,
	settings,
	speedLabel,
}: {
	translate: Translate<ControlsSettingTranslations>;
	saveSettings: () => Promise<void>;
	settings: Settings;
	speedLabel: () => LabelDefinition;
}): CallableOrObjectTree {
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
						placeholder: translate('maxFileSizePlaceholder'),
						rejectZero: true,
						saveSettings,
						type: 'fileSize',
					}),
				})),
				2000: s(() => ({
					desc: translate('maxRequestConcurrencyDescription'),
					labels: [speedLabel()],
					name: translate('maxRequestConcurrency'),
					render: renderTogglableValue({
						field: settings.maxRequestConcurrency,
						placeholder: translate('maxRequestConcurrencyPlaceholder'),
						rejectZero: true,
						saveSettings,
						type: 'number',
					}),
				})),
				3000: s(() => ({
					desc: translate('minRequestIntervalDescription'),
					labels: [speedLabel()],
					name: translate('minRequestInterval'),
					render: renderTogglableValue({
						field: settings.minRequestInterval,
						placeholder: translate('minRequestIntervalPlaceholder'),
						saveSettings,
						type: 'time',
					}),
				})),
				4000: s(() => ({
					desc: translate('maxMemoryConsumptionDescription'),
					labels: [speedLabel()],
					name: translate('maxMemoryConsumption'),
					render: renderTogglableValue({
						field: settings.maxMemoryConsumption,
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
