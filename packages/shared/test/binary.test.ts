import {
	collectStreamToBinary,
	concatBinary,
	decodeBase64,
	decodeBase64Url,
	encodeBase64,
	encodeBase64Url,
	PartBuffer,
} from '@/binary';
import { expect, test } from 'bun:test';
import type { Binary } from '@/binary';

function streamOf(chunks: Array<Binary>): ReadableStream<Binary> {
	return new ReadableStream<Binary>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk);
			controller.close();
		},
	});
}

test('collects every chunk of a stream in order and releases the lock', async () => {
	const stream = streamOf([new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5])]);

	expect(await collectStreamToBinary(stream)).toStrictEqual(new Uint8Array([1, 2, 3, 4, 5]));
	expect(stream.locked).toBe(false);
});

test('collects an empty stream into an empty binary', async () => {
	const stream = streamOf([]);

	expect(await collectStreamToBinary(stream)).toStrictEqual(new Uint8Array(0));
	expect(stream.locked).toBe(false);
});

test('releases the reader lock when the stream errors mid-read', async () => {
	const stream = new ReadableStream<Binary>({
		start(controller) {
			controller.enqueue(new Uint8Array([1]));
			controller.error(new Error('boom'));
		},
	});

	let caught: unknown;
	try {
		await collectStreamToBinary(stream);
	} catch (error) {
		caught = error;
	}

	expect(String(caught)).toContain('boom');
	expect(stream.locked).toBe(false);
});

test('concatBinary returns a lone input unchanged', () => {
	const chunk = new Uint8Array([1, 2, 3]);

	expect(concatBinary(chunk)).toBe(chunk);
});

test('slice takes exact bytes off the front across chunk boundaries', () => {
	const buffer = new PartBuffer();
	buffer.push(new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]));

	expect(buffer.slice(4)).toStrictEqual(new Uint8Array([1, 2, 3, 4]));
	expect(buffer.size).toBe(1);
	expect(buffer.slice(buffer.size)).toStrictEqual(new Uint8Array([5]));
	expect(buffer.size).toBe(0);
});

test('slice returns a lone chunk without copying it', () => {
	const buffer = new PartBuffer();
	const chunk = new Uint8Array([1, 2, 3]);
	buffer.push(chunk);

	expect(buffer.slice(2).buffer).toBe(chunk.buffer);
});

test('encodes an empty binary to an empty string', () => {
	expect(encodeBase64(new Uint8Array(0))).toBe('');
});

test('encodes binaries larger than one chunk into valid base64', () => {
	const bytes = new Uint8Array(0x80_00 * 2 + 5);
	for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;

	expect(new Uint8Array(Buffer.from(encodeBase64(bytes), 'base64'))).toStrictEqual(bytes);
});

test('encode functions fall back to the manual path when toBase64 is absent', () => {
	const bytes = new Uint8Array(0x80_00 * 2 + 5);
	for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
	const expectedBase64 = encodeBase64(bytes);
	const expectedUrl = encodeBase64Url(bytes);
	const proto = Uint8Array.prototype as { toBase64?: unknown };
	const saved = proto.toBase64;
	delete proto.toBase64;
	try {
		expect(encodeBase64(bytes)).toBe(expectedBase64);
		expect(encodeBase64(new Uint8Array(0))).toBe('');
		expect(new Uint8Array(Buffer.from(encodeBase64(bytes), 'base64'))).toStrictEqual(bytes);
		expect(encodeBase64Url(bytes)).toBe(expectedUrl);
	} finally {
		proto.toBase64 = saved;
	}
});

test('decode functions fall back to the manual path when fromBase64 is absent', () => {
	const bytes = new Uint8Array(1024);
	for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
	const encoded = encodeBase64(bytes);
	expect(decodeBase64(encoded)).toStrictEqual(bytes);
	const ctor = Uint8Array as { fromBase64?: unknown };
	const saved = ctor.fromBase64;
	delete ctor.fromBase64;
	try {
		expect(decodeBase64(encoded)).toStrictEqual(bytes);
		expect(decodeBase64('')).toStrictEqual(new Uint8Array(0));
		expect(decodeBase64Url(encodeBase64Url(bytes))).toStrictEqual(bytes);
	} finally {
		ctor.fromBase64 = saved;
	}
});

test('slice throws when fewer bytes are buffered than requested', () => {
	const buffer = new PartBuffer();
	buffer.push(new Uint8Array([1]));

	expect(() => buffer.slice(2)).toThrow();
});
