import HistoryModule from '@/index';
import { expect, test } from 'bun:test';

function fakeContext() {
	const i18n: Array<string> = [];
	const settings: Array<unknown> = [];
	const events: Array<unknown> = [];
	const commands: Array<unknown> = [];
	const listeners: Array<(payload: { remoteFs: unknown }) => void> = [];
	const menuHandlers: Array<(menu: unknown, file: unknown) => void> = [];
	const ctx = {
		addCommand: (command: unknown) => {
			commands.push(command);
			return command;
		},
		app: {
			vault: { on: () => ({ id: 'vault' }) },
			workspace: {
				on: (event: string, handler: (menu: unknown, file: unknown) => void) => {
					if (event === 'file-menu') menuHandlers.push(handler);
					return { id: event };
				},
			},
		},
		getNamespace: () => 'ns',
		indexedDB: { getStore: () => ({}) },
		on: (event: string, listener: (payload: { remoteFs: unknown }) => void) => {
			if (event === 'syncInitialized') listeners.push(listener);
			return () => {};
		},
		registerEvent: (ref: unknown) => events.push(ref),
		registerI18n: (locale: string) => i18n.push(locale),
		registerSetting: (entry: unknown) => {
			settings.push(entry);
			return () => true;
		},
		requestSync: () => Promise.resolve({ result: 'noop' }),
		saveSettings: () => Promise.resolve(),
		translate: (key: string) => key,
	};
	return { commands, ctx, events, i18n, menuHandlers, settings };
}

test('the constructor registers all four locales', () => {
	const { ctx, i18n } = fakeContext();
	const module = new HistoryModule(ctx as never);
	expect(i18n).toStrictEqual(['en', 'zh', 'zh-TW', 'ru']);
	expect(module.moduleSettings.deviceId).toBe('');
});

test('start registers a setting, a vault listener and a file-menu handler', () => {
	const { commands, ctx, events, menuHandlers, settings } = fakeContext();
	const module = new HistoryModule(ctx as never);
	expect(() => module.start()).not.toThrow();
	expect(settings).toHaveLength(1);
	expect(events).toHaveLength(4); // Vault modify, delete, rename + workspace file-menu
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
