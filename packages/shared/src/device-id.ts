import type { App } from 'obsidian';

export const DEVICE_ID_STORAGE_KEY = 'sync-engine-history-device-id';

/**
 * Retrieves or initializes a local, per-device unique identifier. Stored in vault-specific
 * localStorage or browser localStorage to prevent device ID syncing and collisions across synced
 * data.json configurations.
 */
export function getOrCreateDeviceId(app: App, legacyDeviceId?: string): string {
	try {
		const loaded =
			typeof app.loadLocalStorage === 'function'
				? app.loadLocalStorage(DEVICE_ID_STORAGE_KEY)
				: undefined;
		const stored =
			(loaded === null ? undefined : loaded) ??
			(typeof localStorage === 'undefined'
				? undefined
				: localStorage.getItem(DEVICE_ID_STORAGE_KEY));
		if (typeof stored === 'string' && stored.length > 0) return stored;
	} catch {
		// Ignore storage errors (private mode, sandboxes, etc.)
	}

	const id =
		typeof legacyDeviceId === 'string' && legacyDeviceId.length > 0
			? legacyDeviceId
			: crypto.randomUUID();

	try {
		if (typeof app.saveLocalStorage === 'function')
			app.saveLocalStorage(DEVICE_ID_STORAGE_KEY, id);
		else if (typeof localStorage !== 'undefined')
			localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
	} catch {
		// Ignore storage errors
	}

	return id;
}
