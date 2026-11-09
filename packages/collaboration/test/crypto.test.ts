import {
	createChunkAAD,
	decodeBase64Url,
	deriveRoomKeys,
	deriveTopic,
	encodeBase64Url,
	encryptChunk,
	decryptChunk,
	generateRoomCode,
	isFresh,
	parseRoomCode,
} from '@/crypto';
import { beforeAll, expect, test } from 'bun:test';
import type { RoomKeys } from '@/crypto';

const roomCode = generateRoomCode();
let keys: RoomKeys;
let topic: string;

beforeAll(async () => {
	keys = await deriveRoomKeys(parseRoomCode(roomCode));
	topic = await deriveTopic(keys);
});

test('generates and parses room codes', () => {
	const first = generateRoomCode();
	const second = generateRoomCode();
	expect(first).not.toBe(second);
	expect(parseRoomCode(first).roomId.byteLength).toBe(16);
	expect(parseRoomCode(first).secret.byteLength).toBe(32);
});

test('rejects malformed room codes', () => {
	expect(() => parseRoomCode('nope')).toThrow();
	expect(() => parseRoomCode('sec1.abc.def')).toThrow();
	expect(() => parseRoomCode('sec2.abc.def')).toThrow();
});

test('round trips base64url values', () => {
	const value = crypto.getRandomValues(new Uint8Array(257));
	expect(decodeBase64Url(encodeBase64Url(value))).toStrictEqual(value);
});

test('derives a stable topic and encrypts chunks', async () => {
	expect(await deriveTopic(keys)).toBe(topic);
	const aad = createChunkAAD({ batchId: 'batch', clientId: 'sender', sentAt: Date.now(), topic });
	const { ciphertext, nonce } = await encryptChunk(
		keys.encryptionKey,
		new TextEncoder().encode('secret payload'),
		aad,
	);
	expect(
		new TextDecoder().decode(await decryptChunk(keys.encryptionKey, ciphertext, nonce, aad)),
	).toBe('secret payload');
});

test('rejects a different key and tampered ciphertext', async () => {
	const other = await deriveRoomKeys(parseRoomCode(generateRoomCode()));
	const aad = createChunkAAD({ batchId: 'batch', clientId: 'sender', sentAt: Date.now(), topic });
	const { ciphertext, nonce } = await encryptChunk(
		keys.encryptionKey,
		new TextEncoder().encode('secret payload'),
		aad,
	);
	const tampered = new Uint8Array(ciphertext);
	tampered[0] ^= 1;
	const wrongKey = await decryptChunk(other.encryptionKey, ciphertext, nonce, aad).catch(
		(error: unknown) => error,
	);
	const tamperedResult = await decryptChunk(keys.encryptionKey, tampered, nonce, aad).catch(
		(error: unknown) => error,
	);
	expect(wrongKey).toBeInstanceOf(Error);
	expect(tamperedResult).toBeInstanceOf(Error);
});

test('rejects stale and future timestamps', () => {
	const now = Date.now();
	expect(isFresh(now)).toBe(true);
	expect(isFresh(now - 60_000)).toBe(true);
	expect(isFresh(now - 121_000)).toBe(false);
	expect(isFresh(now + 121_000)).toBe(false);
});
