import HistoryModule from '@/index';
import { expect, test } from 'bun:test';
import { openMemoryDB } from 'uni-kv';
import type { WalEntry } from '@/types';
import type { GlobStrategy } from '@repo/shared/glob-match';

const sleep = (ms: number) =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});

function fakeContext() {
	const i18n: Array<string> = [];
	const settings: Array<unknown> = [];
	const events: Array<unknown> = [];
	const commands: Array<unknown> = [];
	const listeners = new Map<string, Array<(payload?: unknown) => void>>();
	const menuHandlers: Array<(menu: unknown, file: unknown) => void> = [];
	const vaultHandlers = new Map<string, (file: unknown, oldPath?: string) => void>();
	const localStorageMap = new Map<string, unknown>();
	const files = new Map<string, string>();
	const memDb = openMemoryDB(`history-${crypto.randomUUID()}`);
	const ctx = {
		addCommand: (command: unknown) => {
			commands.push(command);
			return command;
		},
		app: {
			loadLocalStorage: (key: string) => localStorageMap.get(key),
			saveLocalStorage: (key: string, data: unknown) => {
				if (data === undefined) localStorageMap.delete(key);
				else localStorageMap.set(key, data);
			},
			vault: {
				getAbstractFileByPath: (path: string) => (files.has(path) ? { path } : undefined),
				on: (event: string, handler: (file: unknown, oldPath?: string) => void) => {
					vaultHandlers.set(event, handler);
					return { id: `vault-${event}` };
				},
				read: (file: { path: string }) => Promise.resolve(files.get(file.path) ?? ''),
			},
			workspace: {
				on: (event: string, handler: (menu: unknown, file: unknown) => void) => {
					if (event === 'file-menu') menuHandlers.push(handler);
					return { id: event };
				},
			},
		},
		getNamespace: () => 'ns',
		indexedDB: memDb,
		on: (event: string, listener: (payload?: unknown) => void) => {
			const list = listeners.get(event) ?? [];
			list.push(listener);
			listeners.set(event, list);
			return () => {
				const idx = list.indexOf(listener);
				if (idx !== -1) list.splice(idx, 1);
			};
		},
		registerEvent: (ref: unknown) => events.push(ref),
		registerI18n: (locale: string) => i18n.push(locale),
		registerSetting: (entry: unknown) => {
			settings.push(entry);
			return () => true;
		},
		requestSync: () => Promise.resolve({ result: 'noop' }),
		saveSettings: () => Promise.resolve(),
		settings: { modules: {}, syncStrategy: [] as Array<GlobStrategy> },
		translate: (key: string) => key,
	};
	return {
		commands,
		ctx,
		events,
		files,
		i18n,
		listeners,
		memDb,
		menuHandlers,
		settings,
		vaultHandlers,
	};
}

test('the constructor registers all four locales', () => {
	const { ctx, i18n } = fakeContext();
	const module = new HistoryModule(ctx as never);
	expect(i18n).toStrictEqual(['en', 'zh', 'zh-TW', 'ru']);
	expect(module.moduleSettings.deviceId).toBeUndefined();
});

test('start initializes deviceId in local storage and removes legacy deviceId from moduleSettings', () => {
	const { ctx } = fakeContext();
	const module = new HistoryModule(ctx as never);
	module.moduleSettings.deviceId = 'legacy-device-id-99';
	module.start();
	expect(module.moduleSettings.deviceId).toBeUndefined();
	expect(ctx.app.loadLocalStorage('sync-engine-history-device-id')).toBe('legacy-device-id-99');
	module.dispose();
});

test('start registers a setting, a vault listener and a file-menu handler', () => {
	const { commands, ctx, events, menuHandlers, settings } = fakeContext();
	const module = new HistoryModule(ctx as never);
	expect(() => module.start()).not.toThrow();
	expect(settings).toHaveLength(1);
	expect(events).toHaveLength(5); // Vault create, modify, delete, rename + workspace file-menu
	expect(commands).toHaveLength(1);
	expect(menuHandlers).toHaveLength(1);
	module.dispose();
});

test('the file-menu handler adds a Show history item only for supported files', () => {
	const { ctx, menuHandlers } = fakeContext();
	const module = new HistoryModule(ctx as never);
	module.start();
	const handler = menuHandlers[0];
	const added: Array<string> = [];
	const menu = {
		addItem: (cb: (item: unknown) => void) => {
			const item = {
				onClick: () => item,
				setIcon: () => item,
				setTitle: (title: string) => {
					added.push(title);
					return item;
				},
			};
			cb(item);
		},
	};
	handler(menu, { path: 'note.md' });
	handler(menu, { path: 'board.canvas' });
	handler(menu, { children: [], path: 'folder' });
	handler(menu, { path: 'image.png' });
	expect(added).toHaveLength(2);
	expect(added[0]).toBe('showHistory');
	expect(added[1]).toBe('showHistory');
	module.dispose();
});

test('onVaultCreate queues non-empty supported files with debounce and ignores empty or unsupported files', async () => {
	const { ctx, files, listeners, memDb, vaultHandlers } = fakeContext();
	const module = new HistoryModule(ctx as never);
	module.start();

	const onCreate = vaultHandlers.get('create');
	expect(onCreate).toBeDefined();

	// 1. Empty file create should be ignored
	files.set('empty.md', '');
	onCreate?.({ path: 'empty.md' });
	await sleep(50);
	const pendingEmpty = memDb.getStore('history-pending-ns').values();
	expect(pendingEmpty).toHaveLength(0);

	// 2. Unsupported file should be ignored
	files.set('photo.png', 'binary-data');
	onCreate?.({ path: 'photo.png' });
	await sleep(50);
	const pendingUnsupported = memDb.getStore('history-pending-ns').values();
	expect(pendingUnsupported).toHaveLength(0);

	// 3. Folder should be ignored
	onCreate?.({ children: [], path: 'my-folder' });
	await sleep(50);
	const pendingFolder = memDb.getStore('history-pending-ns').values();
	expect(pendingFolder).toHaveLength(0);

	// 4. Non-empty markdown file is debounced and ingested upon flush/sync
	files.set('note.md', '# Initial Created Content');
	onCreate?.({ path: 'note.md' });
	await sleep(50);
	// In debounce queue, not committed yet
	let pending = memDb.getStore('history-pending-ns').values() as Array<WalEntry>;
	expect(pending).toHaveLength(0);

	// Trigger flush via syncStarted
	const syncStartedListeners = listeners.get('syncStarted') ?? [];
	for (const fn of syncStartedListeners) fn();
	await sleep(50);

	pending = memDb.getStore('history-pending-ns').values() as Array<WalEntry>;
	expect(pending).toHaveLength(1);
	expect(pending[0].key).toBe('note.md');
	expect(pending[0].text).toBe('# Initial Created Content');

	module.dispose();
});

test('sync downloaded files are ignored and not captured by History', async () => {
	const { ctx, files, listeners, memDb, vaultHandlers } = fakeContext();
	const module = new HistoryModule(ctx as never);
	module.start();

	const executionStartedListeners = listeners.get('executionStarted') ?? [];
	const onCreate = vaultHandlers.get('create');
	const onModify = vaultHandlers.get('modify');

	// Simulate sync engine downloading 2 files
	const mockTasks = [
		{ key: 'remote-1.md', name: 'download' },
		{ key: 'remote-2.md', name: 'download' },
	];
	for (const fn of executionStartedListeners) fn(mockTasks);

	files.set('remote-1.md', '# Downloaded from Remote 1');
	files.set('remote-2.md', '# Downloaded from Remote 2');
	onCreate?.({ path: 'remote-1.md' });
	onModify?.({ path: 'remote-2.md' });
	await sleep(50);

	// Trigger syncStarted or flush
	const syncStartedListeners = listeners.get('syncStarted') ?? [];
	for (const fn of syncStartedListeners) fn();
	await sleep(50);

	// Downloaded files should not be captured in history
	const pending = memDb.getStore('history-pending-ns').values() as Array<WalEntry>;
	expect(pending).toHaveLength(0);

	module.dispose();
});

test('syncStarted flushes pending debounces', async () => {
	const { ctx, files, listeners, memDb, vaultHandlers } = fakeContext();
	const module = new HistoryModule(ctx as never);
	module.start();

	const onModify = vaultHandlers.get('modify');
	expect(onModify).toBeDefined();

	files.set('debounced.md', '# Content to debounce');
	onModify?.({ path: 'debounced.md' });

	// Allow read and hash to complete
	await sleep(50);
	// Still in debounce queue, not committed yet
	let pending = memDb.getStore('history-pending-ns').values() as Array<WalEntry>;
	expect(pending).toHaveLength(0);

	// Trigger syncStarted
	const syncStartedListeners = listeners.get('syncStarted') ?? [];
	for (const fn of syncStartedListeners) fn();

	await sleep(50);
	pending = memDb.getStore('history-pending-ns').values() as Array<WalEntry>;
	expect(pending).toHaveLength(1);
	expect(pending[0].key).toBe('debounced.md');

	module.dispose();
});

test('files with none sync strategy are completely ignored by history', async () => {
	const { ctx, files, listeners, memDb, menuHandlers, vaultHandlers } = fakeContext();
	ctx.settings.syncStrategy = [
		{ expr: '*', strategy: 'bidirectional' },
		{ expr: 'ignored/**', strategy: 'none' },
		{ expr: 'secret.md', strategy: 'none' },
	];

	const module = new HistoryModule(ctx as never);
	module.start();

	// 1. Context menu: ignored files should not have "showHistory" option
	const menuHandler = menuHandlers[0];
	const added: Array<string> = [];
	const menu = {
		addItem: (cb: (item: unknown) => void) => {
			const item = {
				onClick: () => item,
				setIcon: () => item,
				setTitle: (title: string) => {
					added.push(title);
					return item;
				},
			};
			cb(item);
		},
	};

	menuHandler(menu, { path: 'regular.md' });
	menuHandler(menu, { path: 'ignored/file.md' });
	menuHandler(menu, { path: 'secret.md' });
	expect(added).toHaveLength(1);
	expect(added[0]).toBe('showHistory');

	// 2. Vault create: ignored file should not be captured into pending WAL
	const onCreate = vaultHandlers.get('create');
	files.set('ignored/doc.md', '# Ignored Note');
	files.set('regular.md', '# Regular Note');
	onCreate?.({ path: 'ignored/doc.md' });
	onCreate?.({ path: 'regular.md' });

	await sleep(50);
	const syncStartedListeners = listeners.get('syncStarted') ?? [];
	for (const fn of syncStartedListeners) fn();
	await sleep(50);

	const pending = memDb.getStore('history-pending-ns').values() as Array<WalEntry>;
	expect(pending).toHaveLength(1);
	expect(pending[0].key).toBe('regular.md');

	// 3. Vault modify: modifying ignored file should not be captured
	const onModify = vaultHandlers.get('modify');
	files.set('ignored/doc.md', '# Ignored Note Modified');
	onModify?.({ path: 'ignored/doc.md' });
	await sleep(50);
	for (const fn of syncStartedListeners) fn();
	await sleep(50);

	const pendingAfterModify = memDb.getStore('history-pending-ns').values() as Array<WalEntry>;
	expect(pendingAfterModify).toHaveLength(1);
	expect(pendingAfterModify[0].key).toBe('regular.md');

	// 4. Vault delete: deleting ignored file should not add WAL tombstone
	const onDelete = vaultHandlers.get('delete');
	onDelete?.({ path: 'ignored/doc.md' });
	await sleep(50);

	const pendingAfterDelete = memDb.getStore('history-pending-ns').values() as Array<WalEntry>;
	expect(pendingAfterDelete).toHaveLength(1);

	// 5. Vault rename: renaming to an ignored path should not capture the new path
	const onRename = vaultHandlers.get('rename');
	files.set('ignored/renamed.md', '# Renamed into ignored folder');
	onRename?.({ path: 'ignored/renamed.md' }, 'regular.md');
	await sleep(50);
	for (const fn of syncStartedListeners) fn();
	await sleep(50);

	const pendingAfterRename = memDb.getStore('history-pending-ns').values() as Array<WalEntry>;
	// Only the previous regular.md entry exists, ignored/renamed.md was never captured
	expect(pendingAfterRename.map((e) => e.key)).toEqual(['regular.md']);

	module.dispose();
});
