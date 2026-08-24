const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type Binary = Uint8Array<ArrayBuffer>;

export function toUint8Array(buffer: ArrayBuffer) {
	return new Uint8Array(buffer);
}

export function toArrayBuffer(chunk: Binary): ArrayBuffer {
	if (chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength) return chunk.buffer;
	return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
}

export function uint8ArrayEquals(a: Binary, b: Binary): boolean {
	if (a === b) return true;
	if (a.byteLength !== b.byteLength) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

export function textToUint8Array(text: string): Binary {
	return encoder.encode(text);
}

export function uint8ArrayToText(bytes: Binary): string {
	return decoder.decode(bytes);
}

export function concatBinary(...arrays: Array<BufferSource>): Binary {
	const totalLength = arrays.reduce((sum, array) => sum + array.byteLength, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const array of arrays) {
		const view =
			array instanceof ArrayBuffer
				? new Uint8Array(array)
				: new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
		result.set(view, offset);
		offset += array.byteLength;
	}
	return result;
}
