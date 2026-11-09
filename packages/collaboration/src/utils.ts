import { Platform } from 'obsidian';
import type { App } from 'obsidian';

/**
 * Device label derived from Obsidian's platform flags, using the same precedence as the plugin
 * core's OS map. Values are already safe for an MQTT client ID (lowercase, hyphens, no spaces).
 */
export default function deviceType(): string {
	if (Platform.isTablet && Platform.isAndroidApp) return 'android-tablet';
	if (Platform.isTablet && Platform.isMacOS) return 'ipados';
	if (Platform.isAndroidApp) return 'android';
	if (Platform.isIosApp) return 'ios';
	if (Platform.isLinux) return 'linux';
	if (Platform.isMacOS) return 'macos';
	if (Platform.isWin) return 'windows';
	return 'desktop';
}

export function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export function text(value: unknown): string {
	return typeof value === 'string' ? value : String(value);
}

/** Full MQTT client ID: the configured (or detected) prefix plus a per-session random suffix. */
export function buildClientId(prefix: string, instanceId: string): string {
	const normalized = prefix.replaceAll(/[^A-Za-z0-9_-]/gu, '').slice(0, 64) || deviceType();
	return `${normalized}-${instanceId}`;
}

/** Reads a broker credential from Obsidian's secret storage by its id. */
export function readSecret(app: App, id: string): string | undefined {
	return (id ? app.secretStorage.getSecret(id) : undefined) ?? undefined;
}
