import deviceType from '@/utils';
import { afterEach, expect, test } from 'bun:test';
import { Platform } from 'obsidian';

const defaults = { ...Platform };

afterEach(() => {
	Object.assign(Platform, defaults);
});

function set(flags: Partial<typeof Platform>): void {
	Object.assign(Platform, defaults, flags);
}

test('falls back to desktop when no OS flag is set', () => {
	set({});
	expect(deviceType()).toBe('desktop');
});

test('returns desktop OS names', () => {
	set({ isWin: true });
	expect(deviceType()).toBe('windows');
	set({ isLinux: true, isWin: false });
	expect(deviceType()).toBe('linux');
	set({ isLinux: false, isMacOS: true });
	expect(deviceType()).toBe('macos');
});

test('prefers mobile app flags over desktop OS flags', () => {
	set({ isIosApp: true, isMacOS: true });
	expect(deviceType()).toBe('ios');
	set({ isAndroidApp: true, isLinux: true });
	expect(deviceType()).toBe('android');
});

test('distinguishes tablets by the same precedence as the plugin OS map', () => {
	set({ isAndroidApp: true, isTablet: true });
	expect(deviceType()).toBe('android-tablet');
	set({ isMacOS: true, isTablet: true });
	expect(deviceType()).toBe('ipados');
});

test('output is always safe for an MQTT client ID', () => {
	for (const flags of [
		{},
		{ isWin: true },
		{ isLinux: true },
		{ isMacOS: true },
		{ isIosApp: true },
		{ isAndroidApp: true },
		{ isAndroidApp: true, isTablet: true },
		{ isMacOS: true, isTablet: true },
	]) {
		set(flags);
		expect(deviceType()).toMatch(/^[a-z-]+$/u);
	}
});
