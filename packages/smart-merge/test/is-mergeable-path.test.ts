import isMergeablePath from '@/utils/is-mergeable-path';
import { expect, test } from 'bun:test';

test('mergeable path detection should accept markdown extensions', () => {
	expect(isMergeablePath(' note.md ')).toBe(true);
	expect(isMergeablePath('folder/NOTE.MARKDOWN')).toBe(true);
	expect(isMergeablePath('folder/note.txt')).toBe(false);
});
