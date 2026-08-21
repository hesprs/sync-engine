// oxlint-disable no-useless-constructor
// oxlint-disable typescript/no-extraneous-class
// oxlint-disable eslint/no-empty-function
// oxlint-disable eslint/require-await
// oxlint-disable typescript/require-await

export async function requestUrl() {
	return {
		headers: {},
		status: 200,
		text: '',
	};
}

export const Platform = {
	isDesktop: true,
	isMobile: false,
};

export function normalizePath(path: string) {
	return path.replaceAll('\\', '/').replaceAll(/\/+/gu, '/');
}

export class Notice {
	constructor(_message: string) {}
}

export class Vault {}
export class TFolder {}
export class TFile {}
export class Plugin {}
export class App {}
export class Modal {}
export class Setting {}
export class PluginSettingTab {}
export class TextComponent {}
export class ButtonComponent {}
export class ProgressBarComponent {}
export class SecretComponent {}

export function setIcon() {}
export function setTooltip() {}
export function getLanguage() {
	return 'en';
}
export function requireApiVersion() {
	return true;
}

export const apiVersion = '1.12.7';
