import collaborationSetting from '@/setting';
import { describe, expect, mock, test } from 'bun:test';
import type { CollaborationSettings } from '@/setting';
import type { App } from 'obsidian';

describe('CollaborationSettings', () => {
	const createMockCtx = (secretValue?: string) => {
		const secrets = new Map<string, string>();
		if (secretValue) secrets.set('sec-123', secretValue);

		const mockApp = {
			secretStorage: { getSecret: (id: string) => secrets.get(id) },
		} as unknown as App;

		return {
			app: mockApp,
			copyRoomCode: mock(() => Promise.resolve(true)),
			copyTopic: mock(() => Promise.resolve(true)),
			generateRoomCode: mock(() => Promise.resolve(true)),
			getStatus: () => ({ status: 'disabled' as const }),
			getTopic: () => 'test-topic',
			reconnect: mock(() => Promise.resolve()),
			refreshSettingTab: mock(() => {}),
			rerenderSettingTab: mock(() => {}),
			saveSettings: mock(() => Promise.resolve()),
			translate: ((key: string) => key) as never,
		};
	};

	test('renders collaboration enable toggle and toggles setting', () => {
		const ctx = createMockCtx();
		const settings: CollaborationSettings = {
			brokerUrl: 'wss://example.com',
			clientIdPrefix: 'desktop',
			enabled: false,
			passwordSecretId: '',
			roomSecretId: '',
			username: '',
		};

		const tree = collaborationSetting(ctx, settings) as unknown as Record<
			number,
			Record<
				number,
				(self: unknown) => {
					render: (setting: {
						addToggle: (cb: (toggle: unknown) => void) => void;
					}) => void;
				}
			>
		>;

		let onChangeCb: ((enabled: boolean) => void) | undefined;
		const mockToggle = {
			onChange: (cb: (enabled: boolean) => void) => {
				onChangeCb = cb;
				return mockToggle;
			},
			setValue: () => mockToggle,
		};

		const node1000 = tree[3050][1000];
		expect(node1000).toBeDefined();

		const def = node1000(node1000);
		def.render({ addToggle: (cb) => cb(mockToggle) });

		expect(onChangeCb).toBeDefined();
		onChangeCb?.(true);
		expect(settings.enabled).toBe(true);
		expect(ctx.reconnect).toHaveBeenCalled();
	});
});
