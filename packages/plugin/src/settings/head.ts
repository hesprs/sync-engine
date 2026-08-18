import type { Context, Settings } from '@';
import type { DatabaseSync } from 'uni-kv';
import { ExtraButtonComponent, Notice } from 'obsidian';
import type { ModuleCtor } from '@/modules/Extensibility';
import type { Translate } from '@/modules/I18n';
import type {
	CallableOrObjectTree,
	CheckConnectionResult,
	ConflictResolverEntry,
	DeciderEntry,
	RemoteFsEntry,
} from '@/modules/Registrar';
import type { General, MaybePromise } from '@/types';
import toErrorMessage from '@/utils/to-error-message';
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
};

type CheckConnectionDB = DatabaseSync<General, { lastCheckedFs: string }>;

export default function headSettings(ctx: {
	translate: Translate<HeadSettingTranslations>;
	saveSettings: () => Promise<void>;
	settings: Settings;
	remoteFsRegistry: Map<string, RemoteFsEntry>;
	deciderRegistry: Map<string, DeciderEntry>;
	conflictResolverRegistry: Map<string, ConflictResolverEntry>;
	getCheckConnection: () => () => MaybePromise<CheckConnectionResult>;
	memoryDB: CheckConnectionDB;
	loadedModules: Map<string, ModuleCtor>;
}): CallableOrObjectTree {
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
	} = ctx;
	return {
		10: s(() => ({
			desc: translate('backendDescription'),
			name: translate('backend'),
			render: (setting) => {
				let checkConnection: (force?: boolean) => Promise<void>;
				let cleanup!: () => void;
				setting
					.addExtraButton((button) => {
						const checks = setupCheckConnection({
							button: button
								.setTooltip(translate('checkConnection'))
								.onClick(() => void checkConnection(true)),
							getCheckConnection,
							memoryDB,
							settings,
							translate,
						});
						checkConnection = checks.checkConnection;
						cleanup = checks.cleanup;
						void checkConnection(false);
					})
					.addDropdown((dropdown) => {
						for (const [key, { prettyName }] of remoteFsRegistry)
							dropdown.addOption(key, prettyName());
						dropdown.setValue(settings.remoteFs).onChange((value) => {
							settings.remoteFs = value;
							void checkConnection();
							void saveSettings();
						});
					});
				return cleanup;
			},
		})),
		20: s(() => ({
			desc: translate('moduleManagementDescription'),
			displayValue: translate('xEnabled', { x: loadedModules.size }),
			name: translate('moduleManagement'),
			page: () => new ModuleManagement(ctx as Context),
			type: 'page',
		})),
		30: s(() => ({
			control: { key: 'moduleAutoUpdate', type: 'toggle' },
			desc: translate('moduleAutoUpdateDescription'),
			name: translate('moduleAutoUpdate'),
		})),
		40: s(() => ({
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
		50: s(() => ({
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
}: {
	memoryDB: CheckConnectionDB;
	getCheckConnection: () => () => MaybePromise<CheckConnectionResult>;
	settings: Settings;
	translate: Translate<HeadSettingTranslations>;
	button: ExtraButtonComponent;
}) {
	let timeout: number | undefined;
	const possibleClasses = [
		'color-[--color-green]',
		'color-[--color-red]',
		'color-neutral-600',
		'animate-spin',
	];
	const setChecking = () => {
		button.setIcon('loader-circle');
		const ele = button.extraSettingsEl.firstElementChild;
		if (!ele) return;
		ele.removeClasses(possibleClasses);
		ele.addClasses(['animate-spin', 'color-neutral-600']);
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
		(timeout = window.setTimeout(() => void checkConnection(), CHECK_CONNECTION_INTERVAL));

	const checkConnection = async (force = false) => {
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
				if (force) new Notice(`${translate('checkConnectionFailed')}: ${result.reason}`);
				else scheduleCheckConnection();
			}
		} catch (error) {
			setError();
			if (force)
				new Notice(`${translate('checkConnectionFailed')}: ${toErrorMessage(error)}`);
			else scheduleCheckConnection();
		}
	};

	return { checkConnection, cleanup: () => window.clearTimeout(timeout) };
}
