import type { Binary } from '@hesprs/sync-engine-sdk';
import {
	textToUint8Array,
	uint8ArrayToText,
	concatBinary,
	toUint8Array,
} from '@repo/shared/binary';
import { DECRYPTION_ERROR_MESSAGE, importAesGcmKey } from './shared';

const META_IV_LENGTH = 12;

export async function encryptMeta(metaKey: Binary, meta: Dict<string>): Promise<Dict<string>> {
	const cryptoKey = await importAesGcmKey(metaKey);
	const result: Dict<string> = {};
	for (const [key, value] of Object.entries(meta)) {
		if (value === undefined) continue;
		const iv = crypto.getRandomValues(new Uint8Array(META_IV_LENGTH));
		const ciphertext = await crypto.subtle.encrypt(
			{ iv, name: 'AES-GCM' },
			cryptoKey,
			textToUint8Array(value),
		);
		result[key] = encodeBase64(concatBinary(iv, toUint8Array(ciphertext)));
	}
	return result;
}

export async function decryptMeta(metaKey: Binary, meta: Dict<string>): Promise<Dict<string>> {
	const cryptoKey = await importAesGcmKey(metaKey);
	const result: Dict<string> = {};
	for (const [key, value] of Object.entries(meta)) {
		if (value === undefined) continue;
		const data = decodeBase64(value);
		if (data.byteLength < META_IV_LENGTH) throw new Error(DECRYPTION_ERROR_MESSAGE);
		try {
			result[key] = uint8ArrayToText(
				toUint8Array(
					await crypto.subtle.decrypt(
						{ iv: data.subarray(0, META_IV_LENGTH), name: 'AES-GCM' },
						cryptoKey,
						data.subarray(META_IV_LENGTH),
					),
				),
			);
		} catch {
			throw new Error(DECRYPTION_ERROR_MESSAGE);
		}
	}
	return result;
}

function encodeBase64(bytes: Binary): string {
	const binary = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
	return btoa(binary);
}

function decodeBase64(value: string): Binary {
	const binary = atob(value);
	return Uint8Array.from(binary, (char) => char.codePointAt(0) as number);
}
