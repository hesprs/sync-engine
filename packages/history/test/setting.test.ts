import { en } from '@/i18n';
import historySetting from '@/setting';
import { describe, expect, mock, test } from 'bun:test';
import type { HistorySettings } from '@/setting';

describe('historySetting', () => {
	test('tieredRetention toggle defaults to true and updates setting', () => {
		const saveSettings = mock(() => Promise.resolve());
		const settings: HistorySettings = {
			autoGc: true,
			maxVersions: 100,
			protectExcludedNotes: false,
			retentionDays: 90,
			tieredRetention: true,
			trackAttachments: false,
		};
		const actions = { runGc: mock(() => Promise.resolve(0)) };
		const tree = historySetting(
			{ saveSettings, translate: ((key: keyof typeof en) => en[key]) as never },
			settings,
			actions,
		) as unknown as Record<
			number,
			Record<
				number,
				(self: unknown) => {
					render: (setting: {
						addToggle: (
							cb: (toggle: {
								onChange: (fn: (v: boolean) => void) => void;
								setValue: (v: boolean) => unknown;
							}) => void,
						) => void;
					}) => void;
				}
			>
		>;

		const group = tree[3055];
		expect(group).toBeDefined();
		const tieredItem = group[2100];
		expect(tieredItem).toBeDefined();

		let toggleVal = false;
		let onChangeHandler: ((v: boolean) => void) | undefined;
		const mockSetting = {
			addToggle: (
				cb: (toggle: {
					onChange: (fn: (v: boolean) => void) => void;
					setValue: (v: boolean) => unknown;
				}) => void,
			) => {
				const mockToggle = {
					onChange: (fn: (v: boolean) => void) => {
						onChangeHandler = fn;
					},
					setValue: (v: boolean) => {
						toggleVal = v;
						return mockToggle;
					},
				};
				cb(mockToggle);
			},
		};

		tieredItem(tieredItem).render(mockSetting);
		expect(toggleVal).toBe(true);

		onChangeHandler?.(false);
		expect(settings.tieredRetention).toBe(false);
		expect(saveSettings).toHaveBeenCalledTimes(1);
	});
});
