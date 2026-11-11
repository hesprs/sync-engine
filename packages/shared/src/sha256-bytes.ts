const encoder = new TextEncoder();
const hex = '0123456789abcdef';
const lookup = Array.from({ length: 256 }, (_, i) => hex[i >> 4] + hex[i & 0xf]);

export function toHex(buffer: ArrayBuffer | Uint8Array): string {
	const view =
		buffer instanceof ArrayBuffer
			? new DataView(buffer)
			: new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	let output = '';
	for (let i = 0; i < view.byteLength; i++) output += lookup[view.getUint8(i)];
	return output;
}

/** Computes SHA-256 digest returning raw ArrayBuffer. */
export function sha256Digest(data: BufferSource): Promise<ArrayBuffer> {
	return crypto.subtle.digest('SHA-256', data);
}

/** Content-addressing primitive. Full SHA-256 over arbitrary bytes, lowercase hex. */
export async function sha256Bytes(data: Uint8Array): Promise<string> {
	// A fresh copy has a concrete ArrayBuffer, satisfying the WebCrypto BufferSource type.
	const buffer = new Uint8Array(data).buffer;
	return toHex(await crypto.subtle.digest('SHA-256', buffer));
}

/** Full SHA-256 over UTF-8 text, lowercase hex. */
export async function sha256Text(input: string): Promise<string> {
	return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(input)));
}

/** Full SHA-256 over UTF-8 text or raw bytes, lowercase hex. */
export async function sha256(input: string | Uint8Array): Promise<string> {
	return typeof input === 'string' ? sha256Text(input) : sha256Bytes(input);
}
