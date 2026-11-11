import { getOrCreateDeviceId, DEVICE_ID_STORAGE_KEY } from '@/device-id';
import { App } from '@/obsidian-mock.spec';
import { beforeEach, expect, test } from 'bun:test';

beforeEach(() => {
	if (typeof localStorage !== 'undefined') localStorage.clear();
});

test('returns existing deviceId from app.loadLocalStorage', () => {
	const app = new App();
	app.saveLocalStorage(DEVICE_ID_STORAGE_KEY, 'stored-device-id');
	const id = getOrCreateDeviceId(app as never);
	expect(id).toBe('stored-device-id');
});

test('migrates legacy deviceId into app storage when none exists', () => {
	const app = new App();
	const id = getOrCreateDeviceId(app as never, 'legacy-uuid');
	expect(id).toBe('legacy-uuid');
	expect(app.loadLocalStorage(DEVICE_ID_STORAGE_KEY)).toBe('legacy-uuid');
});

test('generates and persists a fresh UUID when no prior ID exists', () => {
	const app = new App();
	const id = getOrCreateDeviceId(app as never);
	expect(id).toBeDefined();
	expect(typeof id).toBe('string');
	expect(id.length).toBeGreaterThan(10);
	expect(app.loadLocalStorage(DEVICE_ID_STORAGE_KEY)).toBe(id);

	// Subsequent calls return the same ID
	const second = getOrCreateDeviceId(app as never);
	expect(second).toBe(id);
});

test('falls back to window.localStorage when app methods are missing', () => {
	const bareApp = {} as never;
	const id = getOrCreateDeviceId(bareApp, 'browser-local-id');
	expect(id).toBe('browser-local-id');
	if (typeof localStorage !== 'undefined')
		expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe('browser-local-id');
});
