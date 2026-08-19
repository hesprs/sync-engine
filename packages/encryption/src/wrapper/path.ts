import type { Binary, StoreSync } from '@hesprs/sync-engine-sdk';
import { gcmsiv } from '@noble/ciphers/aes.js';
import { textToUint8Array, uint8ArrayToText } from '@repo/shared/binary';

export type EncryptionStores = {
	decryptedToEncrypted: StoreSync<string>;
	encryptedToDecrypted: StoreSync<string>;
};

const BASENAME_CACHE_LIMIT = 10_000;
const FILE_NAME_NONCE = textToUint8Array('file-name-v1');

export function encryptPathSegments(
	nameKey: Binary,
	key: string,
	stores: EncryptionStores,
): string {
	return transformPathSegments(key, (segment) => encryptPathSegment(nameKey, segment, stores));
}

export function decryptPathSegments(
	nameKey: Binary,
	key: string,
	stores: EncryptionStores,
): string {
	return transformPathSegments(key, (segment) => decryptPathSegment(nameKey, segment, stores));
}

function transformPathSegments(key: string, transformSegment: (segment: string) => string): string {
	return key
		.split('/')
		.map((segment) => (segment === '' ? segment : transformSegment(segment)))
		.join('/');
}

function encryptPathSegment(nameKey: Binary, segment: string, stores: EncryptionStores): string {
	const cached = stores.decryptedToEncrypted.get(segment);
	if (cached !== undefined) return cached;

	const encrypted = encryptBasename(nameKey, segment);
	cacheSegmentPair(stores, segment, encrypted);
	return encrypted;
}

function decryptPathSegment(nameKey: Binary, segment: string, stores: EncryptionStores): string {
	const cached = stores.encryptedToDecrypted.get(segment);
	if (cached !== undefined) return cached;

	const decrypted = decryptBasename(nameKey, segment);
	cacheSegmentPair(stores, decrypted, segment);
	return decrypted;
}

function encryptBasename(nameKey: Binary, basename: string): string {
	const normalizedBasename = normalizeBasename(basename);
	const ciphertext = gcmsiv(nameKey, FILE_NAME_NONCE).encrypt(
		textToUint8Array(normalizedBasename),
	);
	return encodeBase64Url(ciphertext);
}

function decryptBasename(nameKey: Binary, encryptedBasename: string): string {
	if (encryptedBasename === '') throw new Error('Encrypted basename cannot be empty');
	try {
		const plaintext = gcmsiv(nameKey, FILE_NAME_NONCE).decrypt(
			decodeBase64Url(encryptedBasename),
		);
		return normalizeBasename(uint8ArrayToText(plaintext));
	} catch {
		throw new Error('Encrypted basename is malformed');
	}
}

function cacheSegmentPair(stores: EncryptionStores, decrypted: string, encrypted: string) {
	cacheLimitedSet(stores.decryptedToEncrypted, decrypted, encrypted);
	cacheLimitedSet(stores.encryptedToDecrypted, encrypted, decrypted);
}

function cacheLimitedSet(store: StoreSync<string>, key: string, value: string) {
	if (store.get(key) !== undefined) return;
	const keys = store.keys();
	if (keys.length >= BASENAME_CACHE_LIMIT) {
		const oldestKey = keys[0];
		if (oldestKey !== undefined) store.delete(oldestKey);
	}
	store.set(key, value);
}

function normalizeBasename(basename: string) {
	const normalizedBasename = basename.normalize('NFC');
	if (normalizedBasename === '') throw new Error('Basename cannot be empty');
	if (normalizedBasename.includes('/'))
		throw new Error(`Basename must not contain '/': ${basename}`);
	return normalizedBasename;
}

function encodeBase64Url(bytes: Binary): string {
	const binary = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string): Binary {
	const padding = value.length % 4;
	const normalized =
		value.replaceAll('-', '+').replaceAll('_', '/') +
		(padding === 0 ? '' : '='.repeat(4 - padding));
	const binary = atob(normalized);
	return Uint8Array.from(binary, (char) => char.codePointAt(0) as number);
}
