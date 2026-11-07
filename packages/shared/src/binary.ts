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

/**
 * Concatenates the given binaries; a lone `Uint8Array` is returned as-is, so the result may alias
 * the input.
 */
export function concatBinary(...arrays: Array<BufferSource>): Binary {
	if (arrays.length === 1) {
		const [only] = arrays;
		if (only instanceof Uint8Array) return only as Binary;
		if (only instanceof ArrayBuffer) return new Uint8Array(only);
	}
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

/** Collects every chunk of a stream into one Binary, releasing the reader lock when done. */
export async function collectStreamToBinary(source: ReadableStream<Binary>): Promise<Binary> {
	const reader = source.getReader();
	const chunks: Array<Binary> = [];
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}
		return concatBinary(...chunks);
	} finally {
		reader.releaseLock();
	}
}

/** Buffers stream chunks until enough bytes accumulate to slice fixed- or variable-size pieces. */
export class PartBuffer {
	/** Total buffered bytes. */
	size = 0;
	private readonly parts: Array<Binary> = [];

	push(...parts: Array<Binary>): void {
		this.parts.push(...parts);
		this.size += parts.reduce((sum, part) => sum + part.byteLength, 0);
	}

	/**
	 * Takes exactly `size` bytes off the front, merging only the chunks the request reaches; the
	 * returned piece and the kept remainder are views into the merged chunks.
	 */
	slice(size: number): Binary {
		if (size > this.size) throw new Error('PartBuffer slice underflow.');
		let needed = size;
		let count = 0;
		while (needed > 0) {
			needed -= this.parts[count].byteLength;
			count += 1;
		}
		const merged = concatBinary(...this.parts.splice(0, count));
		if (merged.byteLength > size) this.parts.unshift(merged.subarray(size));
		this.size -= size;
		return merged.subarray(0, size);
	}
}

export function encodeBase64(bytes: Binary): string {
	return btoa(Array.from(bytes, (byte) => String.fromCodePoint(byte)).join(''));
}

export function decodeBase64(value: string): Binary {
	return Uint8Array.from(atob(value), (char) => char.codePointAt(0) as number);
}

export function encodeBase64Url(value: Binary): string {
	return encodeBase64(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function decodeBase64Url(value: string): Binary {
	const padding = value.length % 4;
	const normalized =
		value.replaceAll('-', '+').replaceAll('_', '/') +
		(padding === 0 ? '' : '='.repeat(4 - padding));
	return decodeBase64(normalized);
}
