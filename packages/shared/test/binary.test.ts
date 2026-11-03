import { collectStreamToBinary } from '@/binary';
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
