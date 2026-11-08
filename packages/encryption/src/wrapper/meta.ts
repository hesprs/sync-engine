import { DECRYPTION_ERROR_MESSAGE, importAesGcmKey } from './shared';
import {
	textToUint8Array,
	uint8ArrayToText,
	concatBinary,
	toUint8Array,
	decodeBase64,
	encodeBase64,
} from '@repo/shared/binary';
import type { Binary, StringKV } from '@hesprs/sync-engine-sdk';

const META_NONCE_LENGTH = 12;

export async function encryptMeta(metaKey: Binary, meta: StringKV): Promise<StringKV> {
	const cryptoKey = await importAesGcmKey(metaKey);
	for (const [key, value] of Object.entries(meta)) {
		const iv = crypto.getRandomValues(new Uint8Array(META_NONCE_LENGTH));
		const ciphertext = await crypto.subtle.encrypt(
			{ iv, name: 'AES-GCM' },
			cryptoKey,
			textToUint8Array(value),
		);
		meta[key] = encodeBase64(concatBinary(iv, toUint8Array(ciphertext)));
	}
	return meta;
}

export async function decryptMeta(metaKey: Binary, meta: StringKV): Promise<StringKV> {
	const cryptoKey = await importAesGcmKey(metaKey);
	for (const [key, value] of Object.entries(meta))
		try {
			const data = decodeBase64(value);
			if (data.byteLength < META_NONCE_LENGTH) throw new Error(DECRYPTION_ERROR_MESSAGE);
			meta[key] = uint8ArrayToText(
				toUint8Array(
					await crypto.subtle.decrypt(
						{ iv: data.subarray(0, META_NONCE_LENGTH), name: 'AES-GCM' },
						cryptoKey,
						data.subarray(META_NONCE_LENGTH),
					),
				),
			);
		} catch {
			// Pass through
		}
	return meta;
}
