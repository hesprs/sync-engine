import { fnv1a, sha256Text } from '@/crypto';
import { expect, test } from 'bun:test';

test('sha256Text hashes text to a lowercase hex digest', async () => {
	expect(await sha256Text('abc')).toBe(
		'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
	);
});

test('fnv1a hashes the JSON form of its input deterministically', () => {
	expect(fnv1a('vault')).toBe('9bceb8d7');
});
