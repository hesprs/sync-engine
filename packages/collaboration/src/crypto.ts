import { decodeBase64Url, encodeBase64Url, toArrayBuffer } from '@repo/shared/binary';
import type { Binary } from '@hesprs/sync-engine-sdk';

export { decodeBase64, decodeBase64Url, encodeBase64, encodeBase64Url } from '@repo/shared/binary';

export const ROOM_CODE_PREFIX = 'sec1';
export const ROOM_ID_BYTES = 16;
export const ROOM_SECRET_BYTES = 32;
export const NONCE_BYTES = 12;
export const MESSAGE_KEY_BYTES = 32;
export const TOPIC_KEY_BYTES = 32;
export const KEY_DERIVATION_ITERATIONS = 210_000;
export const MAX_CLOCK_SKEW = 120_000;

const CRYPTO_SALT = 'sync-engine-collaboration/v1';
const ENCRYPTION_INFO = 'message-encryption';
const TOPIC_INFO = 'topic';
const textEncoder = new TextEncoder();

export type RoomCode = { roomId: Binary; secret: Binary };
export type RoomKeys = { encryptionKey: CryptoKey; topicKey: CryptoKey; roomId: string };
export type ChunkAAD = { batchId: string; clientId: string; sentAt: number; topic: string };

export function generateRoomCode(): string {
	const roomId = crypto.getRandomValues(new Uint8Array(ROOM_ID_BYTES));
	const secret = crypto.getRandomValues(new Uint8Array(ROOM_SECRET_BYTES));
	return `${ROOM_CODE_PREFIX}.${encodeBase64Url(roomId)}.${encodeBase64Url(secret)}`;
}

export function parseRoomCode(value: string): RoomCode {
	const [prefix, roomIdPart, secretPart, ...rest] = value.trim().split('.');
	if (prefix !== ROOM_CODE_PREFIX || !roomIdPart || !secretPart || rest.length !== 0)
		throw new Error('Invalid collaboration room code');
	const roomId = decodeBase64Url(roomIdPart);
	const secret = decodeBase64Url(secretPart);
	if (roomId.byteLength !== ROOM_ID_BYTES || secret.byteLength !== ROOM_SECRET_BYTES)
		throw new Error('Invalid collaboration room code');
	return { roomId, secret };
}

export function createChunkAAD({ batchId, clientId, sentAt, topic }: ChunkAAD): Binary {
	return textEncoder.encode(
		[ROOM_CODE_PREFIX, topic, batchId, clientId, String(sentAt)].join('\0'),
	);
}

export async function deriveRoomKeys(room: RoomCode): Promise<RoomKeys> {
	const roomId = encodeBase64Url(room.roomId);
	const salt = await crypto.subtle.digest(
		'SHA-256',
		textEncoder.encode(`${CRYPTO_SALT}:${roomId}`),
	);
	const secretKey = await crypto.subtle.importKey(
		'raw',
		toArrayBuffer(room.secret),
		'PBKDF2',
		false,
		['deriveBits'],
	);
	const master = await crypto.subtle.deriveBits(
		{ hash: 'SHA-256', iterations: KEY_DERIVATION_ITERATIONS, name: 'PBKDF2', salt },
		secretKey,
		MESSAGE_KEY_BYTES * 8,
	);
	const [encryptionKey, topicKey] = await Promise.all([
		deriveHkdfKey(master, ENCRYPTION_INFO, salt),
		deriveHkdfKey(master, TOPIC_INFO, salt),
	]);
	return {
		encryptionKey: await crypto.subtle.importKey('raw', encryptionKey, 'AES-GCM', false, [
			'encrypt',
			'decrypt',
		]),
		roomId,
		topicKey: await crypto.subtle.importKey(
			'raw',
			topicKey,
			{ hash: 'SHA-256', name: 'HMAC' },
			false,
			['sign'],
		),
	};
}

async function deriveHkdfKey(
	master: BufferSource,
	info: string,
	salt: BufferSource,
): Promise<ArrayBuffer> {
	const key = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveBits']);
	return crypto.subtle.deriveBits(
		{ hash: 'SHA-256', info: textEncoder.encode(info), name: 'HKDF', salt },
		key,
		TOPIC_KEY_BYTES * 8,
	);
}

export async function deriveTopic(keys: RoomKeys): Promise<string> {
	const digest = await crypto.subtle.sign('HMAC', keys.topicKey, textEncoder.encode(keys.roomId));
	return `sync-engine/collaboration/v1/${encodeBase64Url(digest)}`;
}

export async function encryptChunk(
	key: CryptoKey,
	value: BufferSource,
	aad: BufferSource,
): Promise<{ ciphertext: Binary; nonce: Binary }> {
	const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
	const ciphertext = await crypto.subtle.encrypt(
		{ additionalData: aad, iv: nonce, name: 'AES-GCM' },
		key,
		value,
	);
	return { ciphertext: new Uint8Array(ciphertext), nonce };
}

export async function decryptChunk(
	key: CryptoKey,
	ciphertext: BufferSource,
	nonce: BufferSource,
	aad: BufferSource,
): Promise<Binary> {
	const value = await crypto.subtle.decrypt(
		{ additionalData: aad, iv: nonce, name: 'AES-GCM' },
		key,
		ciphertext,
	);
	return new Uint8Array(value);
}

export function isFresh(sentAt: number, now = Date.now(), tolerance = MAX_CLOCK_SKEW): boolean {
	return Number.isFinite(sentAt) && Math.abs(now - sentAt) <= tolerance;
}
