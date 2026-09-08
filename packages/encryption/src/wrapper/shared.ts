import type { Binary } from '@hesprs/sync-engine-sdk';
import { concatBinary, textToUint8Array, toUint8Array } from '@repo/shared/binary';

const EMPTY_SALT: Binary = new Uint8Array(0);

export const DECRYPTION_ERROR_MESSAGE =
	'Decryption error: incorrect encryption password or the data is corrupted';
export const MASTER_KEY_LENGTH = 32;
export const MASTER_SALT_LENGTH = 16;
export const FILE_SALT_LENGTH = 16;
export const AES_GCM_TAG_LENGTH = 16;
export const CONTENT_CHUNK_SIZE = 128 * 1024;
const ENCRYPTED_CONTENT_CHUNK_SIZE = CONTENT_CHUNK_SIZE + AES_GCM_TAG_LENGTH;
const FILE_KEY_INFO = 'file-key-v1';

export function getEncryptedFileSize(rawFileSize: number): number {
	if (rawFileSize < 0) throw new Error('Raw file size must be non-negative');
	if (rawFileSize === 0) return FILE_SALT_LENGTH;
	return (
		rawFileSize +
		FILE_SALT_LENGTH +
		Math.ceil(rawFileSize / CONTENT_CHUNK_SIZE) * AES_GCM_TAG_LENGTH
	);
}

export async function deriveFileKey(
	rootFileKey: BufferSource,
	fileSalt: BufferSource,
	encryptedFileSize: number,
): Promise<Binary> {
	const fileKeySalt = await sha256Digest(concatBinary(fileSalt, encodeUInt64(encryptedFileSize)));
	return deriveHkdfKey(rootFileKey, FILE_KEY_INFO, fileKeySalt);
}

export async function deriveHkdfKey(
	masterKey: BufferSource,
	info: string,
	salt: BufferSource = EMPTY_SALT,
): Promise<Binary> {
	const keyMaterial = await crypto.subtle.importKey('raw', masterKey, 'HKDF', false, [
		'deriveBits',
	]);
	return toUint8Array(
		await crypto.subtle.deriveBits(
			{
				hash: 'SHA-256',
				info: textToUint8Array(info),
				name: 'HKDF',
				salt,
			},
			keyMaterial,
			MASTER_KEY_LENGTH * 8,
		),
	);
}

export function importAesGcmKey(key: BufferSource): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function decryptContentChunk(
	key: CryptoKey,
	encryptedChunk: BufferSource,
	chunkIndex: number,
): Promise<Binary> {
	try {
		return toUint8Array(
			await crypto.subtle.decrypt(
				{ iv: encodeUInt96(chunkIndex), name: 'AES-GCM' },
				key,
				encryptedChunk,
			),
		);
	} catch {
		throw new Error(DECRYPTION_ERROR_MESSAGE);
	}
}

export function getEncryptedChunkCount(encryptedFileSize: number): number {
	if (encryptedFileSize < FILE_SALT_LENGTH) throw new Error(DECRYPTION_ERROR_MESSAGE);
	const encryptedPayloadSize = encryptedFileSize - FILE_SALT_LENGTH;
	if (encryptedPayloadSize === 0) return 0;
	return Math.ceil(encryptedPayloadSize / ENCRYPTED_CONTENT_CHUNK_SIZE);
}

export function getEncryptedChunkSize(chunkIndex: number, encryptedFileSize: number): number {
	const chunkCount = getEncryptedChunkCount(encryptedFileSize);
	if (chunkIndex < 0 || chunkIndex >= chunkCount) throw new Error(DECRYPTION_ERROR_MESSAGE);
	if (chunkIndex < chunkCount - 1) return ENCRYPTED_CONTENT_CHUNK_SIZE;

	const encryptedPayloadSize = encryptedFileSize - FILE_SALT_LENGTH;
	return encryptedPayloadSize - ENCRYPTED_CONTENT_CHUNK_SIZE * (chunkCount - 1);
}

export function encodeUInt96(value: number): Binary {
	return encodeUInt(value, 12);
}

export function encodeUInt64(value: number): Binary {
	return encodeUInt(value, 8);
}

function encodeUInt(value: number, byteLength: number): Binary {
	if (!Number.isSafeInteger(value) || value < 0)
		throw new Error('Value must be a non-negative safe integer');
	let remainder = value;
	const result = new Uint8Array(byteLength);
	for (let index = result.length - 1; index >= 0; index -= 1) {
		result[index] = remainder & 0xff;
		remainder = Math.floor(remainder / 256);
	}
	return result;
}

export function sha256Digest(data: BufferSource): Promise<ArrayBuffer> {
	return crypto.subtle.digest('SHA-256', data);
}
