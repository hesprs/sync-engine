import { Platform } from 'obsidian';

/**
 * Device label derived from Obsidian's platform flags, using the same precedence as the plugin
 * core's OS map. Values are already safe for an MQTT client ID or device identifier (lowercase,
 * hyphens, no spaces).
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
