// oxlint-disable typescript/no-extraneous-class no-useless-constructor no-empty-function
import { mock } from 'bun:test';

Object.assign(globalThis, {
	sleep: (milliseconds: number) =>
		new Promise<void>((resolve) => {
			setTimeout(resolve, milliseconds);
		}),
	window: globalThis,
});

const Obsidian = {
	App: class {
		private readonly localStorageStore = new Map<string, unknown>();

		loadLocalStorage(key: string): unknown {
			return this.localStorageStore.get(key);
		}

		saveLocalStorage(key: string, data: unknown): void {
			if (data === undefined) this.localStorageStore.delete(key);
			else this.localStorageStore.set(key, data);
		}
	},
	ButtonComponent: class {},
	ConfirmationModal: class {},
	MarkdownView: class {},
	Modal: class {},
	Notice: class {
		constructor(_message: string) {}
	},
	Platform: {
		isAndroidApp: false,
		isDesktop: true,
		isIosApp: false,
		isLinux: false,
		isMacOS: false,
		isMobile: false,
		isMobileApp: false,
		isPhone: false,
		isTablet: false,
		isWin: false,
	},
	Plugin: class {},
	PluginSettingTab: class {},
	ProgressBarComponent: class {},
	SecretComponent: class {},
	Setting: class {},
	TFile: class {},
	TFolder: class {},
	TextComponent: class {},
	Vault: class {},
	apiVersion: '1.15.1',
	getLanguage: () => 'en',
	normalizePath: (path: string) => path.replaceAll('\\', '/').replaceAll(/\/+/gu, '/'),
	requestUrl: () => ({ headers: {}, status: 200, text: '' }),
	requireApiVersion: () => true,
	setIcon: () => {},
	setTooltip: () => {},
};
export default Obsidian;

void mock.module('obsidian', () => Obsidian);
