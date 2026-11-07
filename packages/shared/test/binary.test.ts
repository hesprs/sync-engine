import { collectStreamToBinary, concatBinary, PartBuffer } from '@/binary';
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

test('slice throws when fewer bytes are buffered than requested', () => {
	const buffer = new PartBuffer();
	buffer.push(new Uint8Array([1]));

	expect(() => buffer.slice(2)).toThrow();
});
