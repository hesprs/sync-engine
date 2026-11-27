import { encodeHex, toBinary } from './binary';
import type { Binary } from './binary';

export function fnv1a(input: unknown): string {
	const str = JSON.stringify(input);
	let hashHex = 0x81_1c_9d_c5;
	for (let i = 0; i < str.length; i++) {
		hashHex ^= str.charCodeAt(i);
		hashHex = Math.imul(hashHex, 0x01_00_01_93);
	}
	return (hashHex >>> 0).toString(16);
}

/** Computes SHA-256 digest returning raw ArrayBuffer. */
export async function sha256(data: Binary): Promise<Binary> {
	return toBinary(await crypto.subtle.digest('SHA-256', data));
}

export async function sha256Text(file: string): Promise<string> {
	return sha256(toBinary(file)).then(encodeHex);
}
