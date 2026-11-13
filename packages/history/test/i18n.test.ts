import { en, ru, zh, zhTW } from '@/i18n';
import { expect, test } from 'bun:test';

test('every locale prefixes the file-menu item with Sync Engine', () => {
	for (const locale of [en, zh, zhTW, ru])
		expect(locale.showHistory.toLowerCase()).toContain('sync engine');
});

test('version labels are timestamps, not global version numbers', () => {
	const at = Date.UTC(2026, 10, 10, 13, 29, 39);
	const label = en.version({ at });
	expect(label).not.toMatch(/version\s+\d/iu);
	expect(label).toContain('2026');
});

test('a missing timestamp degrades to an unknown-time label', () => {
	expect(en.version({ at: 0 })).toBe('Time unknown');
});
