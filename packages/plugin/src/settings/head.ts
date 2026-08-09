import type { Settings } from '@';
import type { DatabaseSync } from 'uni-kv';
import { ExtraButtonComponent, Notice, Setting } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import type {
	CheckConnectionResult,
	ConflictResolverEntry,
	DeciderEntry,
	RemoteFsEntry,
} from '@/modules/Registrar';
import type { General, MaybePromise } from '@/types';
import toErrorMessage from '@/utils/to-error-message';

const CHECK_CONNECTION_INTERVAL = 10_000;

export type HeadSettingTranslations = {
	moduleAutoUpdate: string;
	moduleAutoUpdateDescription: string;
	moduleManagement: string;
	moduleManagementDescription: string;
	openPanel: string;
	backend: string;
	backendDescription: string;
	syncStrategy: string;
	syncStrategyDescription: string;
	checkConnectionFailed: string;
	checkConnectionSuccess: string;
	checkConnection: string;
	conflictResolveStrategy: string;
	conflictResolveStrategyDescription: string;
};

export default function headSettings(
	el: HTMLElement,
	ctx: {
		translate: Translate<HeadSettingTranslations>;
		saveSettings: () => Promise<void>;
		settings: Settings;
		openModuleManagement: () => void;
		remoteFsRegistry: Map<string, RemoteFsEntry>;
		deciderRegistry: Map<string, DeciderEntry>;
		conflictResolverRegistry: Map<string, ConflictResolverEntry>;
		getCheckConnection: () => () => MaybePromise<CheckConnectionResult>;
		memoryDB: DatabaseSync<General, { lastCheckedFs: string }>;
	},
) {
	const {
		translate,
		saveSettings,
		settings,
		openModuleManagement,
		remoteFsRegistry,
		deciderRegistry,
		getCheckConnection,
		memoryDB,
		conflictResolverRegistry,
	} = ctx;

	let statusButton: ExtraButtonComponent | undefined;

	const possibleClasses = [
		'color-[--color-green]',
		'color-[--color-red]',
		'color-neutral-600',
		'animate-spin',
	];
	const setChecking = (button: ExtraButtonComponent) => {
		button.setIcon('loader-circle');
		const ele = button.extraSettingsEl.firstElementChild;
		if (!ele) return;
		ele.removeClasses(possibleClasses);
		ele.addClasses(['animate-spin', 'color-neutral-600']);
	};
	const setSuccess = (button: ExtraButtonComponent) => {
		button.setIcon('check');
		const ele = button.extraSettingsEl.firstElementChild;
		if (!ele) return;
		ele.removeClasses(possibleClasses);
		ele.addClasses(['color-[--color-green]']);
	};
	const setError = (button: ExtraButtonComponent) => {
		button.setIcon('cloud-off');
		const ele = button.extraSettingsEl.firstElementChild;
		if (!ele) return;
		ele.removeClasses(possibleClasses);
		ele.addClasses(['color-[--color-red]']);
	};
	const scheduleCheckConnection = () =>
		window.setTimeout(() => void checkConnection(), CHECK_CONNECTION_INTERVAL);

	const checkConnection = async (force = false, skipGC = false) => {
		if (!statusButton) return;
		if (!statusButton.extraSettingsEl.isConnected && !skipGC) {
			statusButton = undefined;
			return;
		}
		if (memoryDB.getMeta('lastCheckedFs') === settings.remoteFs && !force) {
			setSuccess(statusButton);
			return;
		}
		if (!settings.remoteFs) {
			setError(statusButton);
			return;
		}

		try {
			setChecking(statusButton);
			const result = await getCheckConnection()();
			if (result.success) {
				memoryDB.setMeta('lastCheckedFs', settings.remoteFs);
				setSuccess(statusButton);
				if (force) new Notice(translate('checkConnectionSuccess'));
			} else {
				setError(statusButton);
				if (force) new Notice(`${translate('checkConnectionFailed')}: ${result.reason}`);
				else scheduleCheckConnection();
			}
		} catch (error) {
			setError(statusButton);
			if (force)
				new Notice(`${translate('checkConnectionFailed')}: ${toErrorMessage(error)}`);
			else scheduleCheckConnection();
		}
	};

	new Setting(el)
		.setName(translate('backend'))
		.setDesc(translate('backendDescription'))
		.addExtraButton((button) => {
			statusButton = button
				.setTooltip(translate('checkConnection'))
				.onClick(() => void checkConnection(true));
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
	void checkConnection(false, true);

	new Setting(el)
		.setName(translate('moduleManagement'))
		.setDesc(translate('moduleManagementDescription'))
		.addButton((button) =>
			button.setButtonText(translate('openPanel')).onClick(openModuleManagement).setCta(),
		);

	new Setting(el)
		.setName(translate('moduleAutoUpdate'))
		.setDesc(translate('moduleAutoUpdateDescription'))
		.addToggle((toggle) =>
			toggle.setValue(settings.moduleAutoUpdate).onChange((value) => {
				settings.moduleAutoUpdate = value;
				void saveSettings();
			}),
		);

	new Setting(el)
		.setName(translate('syncStrategy'))
		.setDesc(translate('syncStrategyDescription'))
		.addDropdown((dropdown) => {
			for (const [key, { prettyName }] of deciderRegistry)
				dropdown.addOption(key, prettyName());
			dropdown.setValue(settings.decider).onChange((value) => {
				settings.decider = value;
				void saveSettings();
			});
		});

	new Setting(el)
		.setName(translate('conflictResolveStrategy'))
		.setDesc(translate('conflictResolveStrategyDescription'))
		.addDropdown((dropdown) => {
			for (const [key, { prettyName }] of conflictResolverRegistry)
				dropdown.addOption(key, prettyName());
			dropdown.setValue(settings.conflictResolver).onChange((value) => {
				settings.conflictResolver = value;
				void saveSettings();
			});
		});
}
