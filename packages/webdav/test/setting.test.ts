import { expect, test } from 'bun:test';
import { parseEndpoint } from '@/setting';

test('returns normalized HTTP(S) endpoints', () => {
	expect(parseEndpoint('https://nextcloud.example.com/remote.php/dav/')).toBe(
		'https://nextcloud.example.com/remote.php/dav',
	);
});

test('rejects non-HTTP(S) endpoints', () => {
	expect(parseEndpoint('ftp://nextcloud.example.com/remote.php/dav')).toBeUndefined();
});
