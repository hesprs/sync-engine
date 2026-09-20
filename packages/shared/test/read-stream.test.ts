import { expect, test } from 'bun:test';
import type { Binary } from '@/binary';
import createRangeReadStream from '@/read-stream';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

async function collectStream(source: ReadableStream<Binary>): Promise<Binary> {
	const chunks: Array<Binary> = [];
	for await (const chunk of source) chunks.push(chunk);
	let total = 0;
	for (const chunk of chunks) total += chunk.byteLength;
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

const flush = () =>
	new Promise<undefined>((resolve) => {
		setTimeout(resolve, 0);
	});

test('requests chunked ranges with the last chunk clamped to file size', async () => {
	const ranges: Array<[number, number]> = [];
	const stream = createRangeReadStream({
		chunkSize: 2,
		concurrency: 3,
		requestRange: (start, endInclusive) => {
			ranges.push([start, endInclusive]);
			return Promise.resolve(new Uint8Array(endInclusive - start + 1).fill(1));
		},
		size: 5,
	});

	expect(await collectStream(stream)).toStrictEqual(new Uint8Array(5).fill(1));
	expect(ranges).toStrictEqual([
		[0, 1],
		[2, 3],
		[4, 4],
	]);
});

test('completes immediately for an empty file without requesting ranges', async () => {
	const stream = createRangeReadStream({
		chunkSize: 2,
		concurrency: 2,
		requestRange: () => Promise.reject(new Error('unexpected range request')),
		size: 0,
	});

	expect(await collectStream(stream)).toStrictEqual(new Uint8Array(0));
});

test('emits chunks in file order when responses arrive out of order', async () => {
	const ranges: Array<[number, number]> = [];
	const resolvers: Array<ReturnType<typeof deferred<Binary>>> = [];
	const stream = createRangeReadStream({
		chunkSize: 2,
		concurrency: 3,
		requestRange(start, endInclusive) {
			ranges.push([start, endInclusive]);
			const pending = deferred<Binary>();
			resolvers.push(pending);
			return pending.promise;
		},
		size: 6,
	});

	const collected = collectStream(stream);
	await flush();
	expect(ranges).toStrictEqual([
		[0, 1],
		[2, 3],
		[4, 5],
	]);

	resolvers[2]?.resolve(new Uint8Array([3, 3]));
	resolvers[0]?.resolve(new Uint8Array([1, 1]));
	resolvers[1]?.resolve(new Uint8Array([2, 2]));

	expect(await collected).toStrictEqual(new Uint8Array([1, 1, 2, 2, 3, 3]));
});

test('waits for consumer demand before requesting ranges', async () => {
	const ranges: Array<[number, number]> = [];
	const stream = createRangeReadStream({
		chunkSize: 2,
		concurrency: 2,
		requestRange: (start, endInclusive) => {
			ranges.push([start, endInclusive]);
			return Promise.resolve(new Uint8Array(endInclusive - start + 1));
		},
		size: 4,
	});

	await flush();
	expect(ranges).toStrictEqual([]);

	expect(await collectStream(stream)).toStrictEqual(new Uint8Array(4));
	expect(ranges).toStrictEqual([
		[0, 1],
		[2, 3],
	]);
});

test('propagates requestRange errors to the stream', () => {
	const requestError = new Error('range failed');
	const stream = createRangeReadStream({
		chunkSize: 2,
		concurrency: 1,
		requestRange: () => Promise.reject(requestError),
		size: 1,
	});

	expect(collectStream(stream)).rejects.toBe(requestError);
});

test('runs finally after the stream completes', async () => {
	let finalized = false;
	const stream = createRangeReadStream({
		chunkSize: 2,
		concurrency: 2,
		finalize: () => {
			finalized = true;
		},
		requestRange: (start, endInclusive) =>
			Promise.resolve(new Uint8Array(endInclusive - start + 1)),
		size: 4,
	});

	const reader = stream.getReader();
	await reader.read();
	await reader.cancel();
	expect(finalized).toBe(true);
});
