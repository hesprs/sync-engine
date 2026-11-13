import { readSecret } from '@repo/shared/secret';
import type { App } from 'obsidian';

/** Prefix marking an encrypted history object. */
const MAGIC = new Uint8Array([0x53, 0x45, 0x48, 0x50, 0x43, 0x31]); // "SEHPC1"
const IV_BYTES = 12;
// Module-specific salt: the derived key is intentionally independent from the encryption module's
// own rootFileKey (which uses argon2id + HKDF). Reusing the password but not the key derivation
// avoids cross-protocol key reuse while still requiring no second password from the user.
const KEY_SALT = new TextEncoder().encode('sync-engine-history/content/v1');
const PBKDF2_ITERATIONS = 100_000;

export type HistoryCipher = {
	encrypt: (data: Uint8Array) => Promise<Uint8Array>;
	decrypt: (data: Uint8Array) => Promise<Uint8Array>;
};

function hasMagic(data: Uint8Array): boolean {
	if (data.byteLength < MAGIC.byteLength) return false;
	for (let index = 0; index < MAGIC.byteLength; index++)
		if (data[index] !== MAGIC[index]) return false;
	return true;
}

/** Concatenation over Uint8Array without the BufferSource variance of concatBinary. */
function concat(...parts: Array<Uint8Array>): Uint8Array {
	let total = 0;
	for (const part of parts) total += part.byteLength;
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.byteLength;
	}
	return out;
}

function concrete(data: Uint8Array): Uint8Array<ArrayBuffer> {
	return new Uint8Array(data);
}

export async function createCipher(password: string): Promise<HistoryCipher> {
	const baseKey = await crypto.subtle.importKey(
		'raw',
		concrete(new TextEncoder().encode(password)).buffer,
		'PBKDF2',
		false,
		['deriveKey'],
	);
	const key = await crypto.subtle.deriveKey(
		{ hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, name: 'PBKDF2', salt: KEY_SALT.buffer },
		baseKey,
		{ length: 256, name: 'AES-GCM' },
		false,
		['encrypt', 'decrypt'],
	);
	return {
		async decrypt(data) {
			if (!hasMagic(data))
				throw new Error('Cannot decrypt history: missing encryption magic header.');
			const iv = data.subarray(MAGIC.byteLength, MAGIC.byteLength + IV_BYTES);
			const ciphertext = data.subarray(MAGIC.byteLength + IV_BYTES);
			try {
				return new Uint8Array(
					await crypto.subtle.decrypt(
						{ iv: concrete(iv).buffer, name: 'AES-GCM' },
						key,
						concrete(ciphertext).buffer,
					),
				);
			} catch {
				throw new Error(
					'Cannot decrypt history: the encryption password changed or data is corrupted.',
				);
			}
		},
		async encrypt(data) {
			const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
			const ciphertext = new Uint8Array(
				await crypto.subtle.encrypt({ iv, name: 'AES-GCM' }, key, concrete(data).buffer),
			);
			return concat(MAGIC, iv, ciphertext);
		},
	};
}

/**
 * Detects whether the encryption module is active and derives a content cipher from its password.
 * Returns undefined when encryption is off (plaintext). Throws when encryption is on but no
 * password is configured, because writing plaintext in that state would leak note contents.
 */
export async function createHistoryCipher(
	modules: Record<string, object>,
	app: App,
): Promise<HistoryCipher | undefined> {
	const encryption = modules.encryption as { enabled?: boolean; password?: string } | undefined;
	if (!encryption?.enabled) return undefined;
	const password = readSecret(app, encryption.password);
	if (!password) throw new Error('Encryption is enabled but its password is not set.');
	return createCipher(password);
}
