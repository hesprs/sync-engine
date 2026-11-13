import { sha256, sha256Bytes, sha256Digest, sha256Text, toHex } from '../src/sha256-bytes';
import { expect, test } from 'bun:test';

test('sha256Text and sha256Bytes produce consistent lowercase hex hash', async () => {
	const str = 'hello world';
	const bytes = new TextEncoder().encode(str);
	const expected = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';

	expect(await sha256Text(str)).toBe(expected);
	expect(await sha256Bytes(bytes)).toBe(expected);
	expect(await sha256(str)).toBe(expected);
	expect(await sha256(bytes)).toBe(expected);
});

test('sha256Digest returns raw ArrayBuffer', async () => {
	const bytes = new TextEncoder().encode('hello world');
	const digest = await sha256Digest(bytes);
	expect(digest instanceof ArrayBuffer).toBe(true);
	expect(toHex(digest)).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
});

test('toHex converts both Uint8Array and ArrayBuffer', () => {
	const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
	expect(toHex(bytes)).toBe('deadbeef');
	expect(toHex(bytes.buffer)).toBe('deadbeef');
});
