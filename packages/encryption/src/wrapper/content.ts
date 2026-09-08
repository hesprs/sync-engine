import type { Binary } from '@hesprs/sync-engine-sdk';
import { concatBinary, textToUint8Array, toUint8Array } from '@repo/shared/binary';
import { argon2id } from 'hash-wasm';
import {
	CONTENT_CHUNK_SIZE,
	DECRYPTION_ERROR_MESSAGE,
	FILE_SALT_LENGTH,
	MASTER_KEY_LENGTH,
	MASTER_SALT_LENGTH,
	decryptContentChunk,
	deriveFileKey,
	deriveHkdfKey,
	encodeUInt96,
	getEncryptedChunkSize,
	getEncryptedFileSize,
	importAesGcmKey,
	sha256Digest,
} from './shared';

const ROOT_FILE_KEY_INFO = 'root-file-key-v1';
const NAME_KEY_INFO = 'name-key-v1';

export async function deriveMasterSalt(remoteUid: string): Promise<Binary> {
	const digest = await sha256Digest(textToUint8Array(remoteUid));
	return toUint8Array(digest.slice(0, MASTER_SALT_LENGTH));
}

export function deriveMasterKey(password: string | Binary, masterSalt: Binary): Promise<Binary> {
	return argon2id({
		hashLength: MASTER_KEY_LENGTH,
		iterations: 3,
		memorySize: 32 * 1024,
		outputType: 'binary',
		parallelism: 1,
		password,
		salt: masterSalt,
	}) as Promise<Binary>;
}

export function deriveRootFileKey(masterKey: Binary): Promise<Binary> {
	return deriveHkdfKey(masterKey, ROOT_FILE_KEY_INFO);
}

export function deriveNameKey(masterKey: Binary): Promise<Binary> {
	return deriveHkdfKey(masterKey, NAME_KEY_INFO);
}

export async function encryptFileContent(rootFileKey: Binary, plaintext: Binary): Promise<Binary> {
	const encryptedFileSize = getEncryptedFileSize(plaintext.byteLength);
	const fileSalt = crypto.getRandomValues(new Uint8Array(FILE_SALT_LENGTH));
	const fileKey = await importAesGcmKey(
		await deriveFileKey(rootFileKey, fileSalt, encryptedFileSize),
	);
	const encryptedChunks: Array<Binary> = [fileSalt];

	for (
		let chunkIndex = 0, offset = 0;
		offset < plaintext.byteLength;
		offset += CONTENT_CHUNK_SIZE, chunkIndex += 1
	) {
		const chunk = plaintext.subarray(offset, offset + CONTENT_CHUNK_SIZE);
		encryptedChunks.push(await encryptContentChunk(fileKey, chunk, chunkIndex));
	}

	return concatBinary(...encryptedChunks);
}

export async function encryptContentChunk(
	key: CryptoKey,
	chunk: Binary,
	chunkIndex: number,
): Promise<Binary> {
	return toUint8Array(
		await crypto.subtle.encrypt({ iv: encodeUInt96(chunkIndex), name: 'AES-GCM' }, key, chunk),
	);
}

export async function decryptFileContent(
	rootFileKey: Binary,
	encryptedContent: Binary,
	encryptedFileSize: number,
): Promise<Binary> {
	if (
		encryptedContent.byteLength !== encryptedFileSize ||
		encryptedContent.byteLength < FILE_SALT_LENGTH
	)
		throw new Error(DECRYPTION_ERROR_MESSAGE);

	const fileSalt = encryptedContent.subarray(0, FILE_SALT_LENGTH);
	const fileKey = await importAesGcmKey(
		await deriveFileKey(rootFileKey, fileSalt, encryptedFileSize),
	);
	const plaintextChunks: Array<Binary> = [];
	let offset = FILE_SALT_LENGTH;

	for (let chunkIndex = 0; offset < encryptedContent.byteLength; chunkIndex += 1) {
		const encryptedChunkSize = getEncryptedChunkSize(chunkIndex, encryptedFileSize);
		const encryptedChunk = encryptedContent.subarray(offset, offset + encryptedChunkSize);
		if (encryptedChunk.byteLength !== encryptedChunkSize)
			throw new Error(DECRYPTION_ERROR_MESSAGE);
		plaintextChunks.push(await decryptContentChunk(fileKey, encryptedChunk, chunkIndex));
		offset += encryptedChunkSize;
	}

	if (offset !== encryptedContent.byteLength) throw new Error(DECRYPTION_ERROR_MESSAGE);
	return concatBinary(...plaintextChunks);
}
