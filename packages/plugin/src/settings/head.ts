import type { Context, Events, Settings } from '@';
import type { DatabaseSync } from 'uni-kv';
import { ExtraButtonComponent, Notice, PluginSettingTab, setTooltip } from 'obsidian';
import type { ModuleCtor } from '@/modules/Extensibility';
import type { Fragment, Translate } from '@/modules/I18n';
import type {
	CheckConnectionResult,
	ConflictResolverEntry,
	DeciderEntry,
	RemoteFsEntry,
} from '@/modules/Registrar';
import type { CallableOrObjectTree } from '@/modules/Setting';
import type { Dispatch } from '@/sdk';
import type { General, MaybePromise } from '@/types';
import toErrorMessage from '@/utils/to-error-message';
import type { AugmentedSettingDefinitionItem, LabelDefinition } from './utils';
import ModuleManagement from './module-management';
import { s } from './utils';

const CHECK_CONNECTION_INTERVAL = 10_000;

export type HeadSettingTranslations = {
	moduleAutoUpdate: string;
	moduleAutoUpdateDescription: string;
	moduleManagement: string;
	moduleManagementDescription: string;
	backend: string;
	backendDescription: string;
	syncStrategy: string;
	syncStrategyDescription: string;
	checkConnectionFailed: string;
	checkConnectionSuccess: string;
	checkConnection: string;
	conflictResolveStrategy: string;
	conflictResolveStrategyDescription: string;
	xEnabled: string;
	settingTips: Fragment<{ labels: Array<LabelDefinition>; addLabel: typeof addLabel }>;
};

type CheckConnectionDB = DatabaseSync<General, { lastCheckedFs: string }>;

export default function headSettings(
	ctx: {
		translate: Translate<HeadSettingTranslations>;
		saveSettings: () => Promise<void>;
		settings: Settings;
		remoteFsRegistry: Map<string, RemoteFsEntry>;
		deciderRegistry: Map<string, DeciderEntry>;
		conflictResolverRegistry: Map<string, ConflictResolverEntry>;
		getCheckConnection: () => () => MaybePromise<CheckConnectionResult>;
		memoryDB: CheckConnectionDB;
		loadedModules: Map<string, ModuleCtor>;
		matchLabel: () => LabelDefinition;
		speedLabel: () => LabelDefinition;
		dispatch: Dispatch<Events>;
	},
	getSettingTab: () => PluginSettingTab | undefined,
): CallableOrObjectTree {
	const {
		loadedModules,
		translate,
		saveSettings,
		settings,
		remoteFsRegistry,
		deciderRegistry,
		getCheckConnection,
		memoryDB,
		conflictResolverRegistry,
		matchLabel,
		speedLabel,
		dispatch,
	} = ctx;
	return {
		10: s(() => ({
			desc: translate('settingTips', { addLabel, labels: [matchLabel(), speedLabel()] }),
			name: 'dummy',
			render: (setting) => {
				setting.settingEl.addClass('sync-engine-setting-tip');
				queueMicrotask(() => {
					const tab = getSettingTab();
					if (!tab) return;
					const recurseLabel = (items: Array<AugmentedSettingDefinitionItem>) => {
						for (const item of items) {
							if ('labels' in item && item.labels) {
								const name = tab
									.getElementForDefinition(item)
									?.querySelector('.setting-item-name');
								if (!name) return;
								for (const label of item.labels) addLabel(name, label);
							}
							if ('items' in item) recurseLabel(item.items as never);
						}
					};
					recurseLabel(tab.settingItems);
				});
			},
			search: false,
		})),
		20: s(() => ({
			desc: translate('backendDescription'),
			labels: [matchLabel()],
			name: translate('backend'),
			render: (setting) => {
				let checks!: ReturnType<typeof setupCheckConnection>;
				setting
					.addExtraButton((button) => {
						checks = setupCheckConnection({
							button: button
								.setTooltip(translate('checkConnection'))
								.onClick(() => void checks.check(true)),
							getCheckConnection,
							log: (str: string) => dispatch('errorGeneral', str),
							memoryDB,
							settings,
							translate,
						});
						void checks.check(false);
					})
					.addDropdown((dropdown) => {
						for (const [key, { prettyName }] of remoteFsRegistry)
							dropdown.addOption(key, prettyName());
						dropdown.setValue(settings.remoteFs).onChange((value) => {
							settings.remoteFs = value;
							void checks.check();
							void saveSettings();
						});
					});
				return checks.cleanup;
			},
		})),
		30: s(() => ({
			desc: translate('moduleManagementDescription'),
			displayValue: translate('xEnabled', { x: loadedModules.size }),
			name: translate('moduleManagement'),
			page: () => new ModuleManagement(ctx as Context),
			type: 'page',
		})),
		40: s(() => ({
			control: { key: 'moduleAutoUpdate', type: 'toggle' },
			desc: translate('moduleAutoUpdateDescription'),
			name: translate('moduleAutoUpdate'),
		})),
		50: s(() => ({
			control: {
				key: 'decider',
				options: Object.fromEntries(
					[...deciderRegistry].map(([key, { prettyName }]) => [key, prettyName()]),
				),
				type: 'dropdown',
			},
			desc: translate('syncStrategyDescription'),
			name: translate('syncStrategy'),
		})),
		60: s(() => ({
			control: {
				key: 'conflictResolver',
				options: Object.fromEntries(
					[...conflictResolverRegistry].map(([key, { prettyName }]) => [
						key,
						prettyName(),
					]),
				),
				type: 'dropdown',
			},
			desc: translate('conflictResolveStrategyDescription'),
			name: translate('conflictResolveStrategy'),
		})),
	};
}

function setupCheckConnection({
	memoryDB,
	getCheckConnection,
	settings,
	translate,
	button,
	log,
}: {
	memoryDB: CheckConnectionDB;
	getCheckConnection: () => () => MaybePromise<CheckConnectionResult>;
	settings: Settings;
	translate: Translate<HeadSettingTranslations>;
	button: ExtraButtonComponent;
	log: (str: string) => void;
}) {
	let timeout: number | undefined;
	const possibleClasses = [
		'color-[--color-green]',
		'color-[--color-red]',
		'color-[-text-faint]',
		'animate-spin',
	];
	const setChecking = () => {
		button.setIcon('loader-circle');
		const ele = button.extraSettingsEl.firstElementChild;
		if (!ele) return;
		ele.removeClasses(possibleClasses);
		ele.addClasses(['animate-spin', 'color-[-text-faint]']);
	};
	const setSuccess = () => {
		button.setIcon('check');
		const ele = button.extraSettingsEl.firstElementChild;
		if (!ele) return;
		ele.removeClasses(possibleClasses);
		ele.addClasses(['color-[--color-green]']);
	};
	const setError = () => {
		button.setIcon('cloud-off');
		const ele = button.extraSettingsEl.firstElementChild;
		if (!ele) return;
		ele.removeClasses(possibleClasses);
		ele.addClasses(['color-[--color-red]']);
	};
	const scheduleCheckConnection = () =>
		(timeout = window.setTimeout(() => void check(), CHECK_CONNECTION_INTERVAL));

	const check = async (force = false) => {
		if (memoryDB.getMeta('lastCheckedFs') === settings.remoteFs && !force) {
			setSuccess();
			return;
		}
		if (!settings.remoteFs) {
			setError();
			return;
		}

		try {
			setChecking();
			const result = await getCheckConnection()();
			if (result.success) {
				memoryDB.setMeta('lastCheckedFs', settings.remoteFs);
				setSuccess();
				if (force) new Notice(translate('checkConnectionSuccess'));
			} else {
				setError();
				log(`Check connection to \`${settings.remoteFs}\` failed: \`${result.reason}\`.`);
				if (force) new Notice(`${translate('checkConnectionFailed')}: ${result.reason}`);
				else scheduleCheckConnection();
			}
		} catch (error) {
			setError();
			const message = toErrorMessage(error);
			log(`Check connection to \`${settings.remoteFs}\` failed: \`${message}\`.`);
			if (force) new Notice(`${translate('checkConnectionFailed')}: ${message}`);
			else scheduleCheckConnection();
		}
	};

	return { check, cleanup: () => window.clearTimeout(timeout) };
}

function addLabel(
	element: Element,
	{
		text,
		tooltip,
		color = 'var(--interactive-accent)',
		textColor = 'var(--text-on-accent)',
	}: LabelDefinition,
) {
	const tag = element.createSpan({ cls: 'flair', text });
	setTooltip(tag, tooltip);
	tag.style.setProperty('--flair-color', textColor);
	tag.style.setProperty('--flair-background', color);
	return tag;
}
