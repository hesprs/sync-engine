import { expect, test } from 'bun:test';
import type { Binary } from '@/binary';
import { concatBinary } from '@/binary';
import chunkedUpload from '@/chunked-upload';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function streamOf(chunks: Array<Binary>): ReadableStream<Binary> {
	return new ReadableStream<Binary>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk);
			controller.close();
		},
	});
}

test('slices fixed-size chunks with offsets and orders results by chunk index', async () => {
	const uploads: Array<{ size: number; offset: number; isLast: boolean }> = [];
	const results = await chunkedUpload({
		chunkSize: 4,
		concurrency: 3,
		uploadChunk: (chunk, index, offset, isLast) => {
			uploads.push({ isLast, offset, size: chunk.byteLength });
			return Promise.resolve(index * 10);
		},
		value: streamOf([new Uint8Array(6).fill(1), new Uint8Array(4).fill(2)]),
	});

	expect(uploads).toStrictEqual([
		{ isLast: false, offset: 0, size: 4 },
		{ isLast: false, offset: 4, size: 4 },
		{ isLast: true, offset: 8, size: 2 },
	]);
	expect(results).toStrictEqual([10, 20, 30]);
});

test('limits concurrency to the configured maximum', async () => {
	const resolvers: Array<ReturnType<typeof deferred<number>>> = [];
	let inFlight = 0;
	let maxInFlight = 0;
	const upload = chunkedUpload({
		chunkSize: 2,
		concurrency: 3,
		uploadChunk: () => {
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			const wait = deferred<number>();
			resolvers.push(wait);
			return wait.promise.finally(() => {
				inFlight -= 1;
			});
		},
		value: streamOf([new Uint8Array(8)]),
	});

	await new Promise<undefined>((resolve) => {
		setTimeout(resolve, 0);
	});
	expect(maxInFlight).toBe(3);
	expect(resolvers).toHaveLength(3);

	resolvers[0]?.resolve(1);
	await new Promise<undefined>((resolve) => {
		setTimeout(resolve, 0);
	});
	expect(resolvers).toHaveLength(4);

	for (const [index, resolver] of resolvers.entries()) resolver.resolve(index + 1);
	await upload;
});

test('pauses reading so uploaded chunks stay within chunkSize plus one stream chunk', async () => {
	const chunkSize = 4;
	const streamChunkSize = 3;
	const streamChunks = 10;
	let maxChunk = 0;
	let readCount = 0;
	const source = new ReadableStream<Binary>({
		pull(controller) {
			readCount += 1;
			if (readCount > streamChunks) controller.close();
			else controller.enqueue(new Uint8Array(streamChunkSize));
		},
	});
	const uploaded = await chunkedUpload({
		chunkSize,
		concurrency: 1,
		uploadChunk: (chunk) => {
			maxChunk = Math.max(maxChunk, chunk.byteLength);
			return Promise.resolve(chunk.byteLength);
		},
		value: source,
	});

	// Each read can add up to one stream chunk to the buffer before it is
	// Sliced, so a chunk never exceeds chunkSize + one stream chunk.
	expect(maxChunk).toBeLessThanOrEqual(chunkSize + streamChunkSize);
	expect(uploaded.reduce((sum, size) => sum + size, 0)).toBe(streamChunks * streamChunkSize);
});

test('resolves with no results for an empty stream without uploading', async () => {
	let uploaded = false;
	const results = await chunkedUpload({
		chunkSize: 4,
		concurrency: 2,
		uploadChunk: () => {
			uploaded = true;
			return Promise.resolve(0);
		},
		value: streamOf([]),
	});

	expect(uploaded).toBe(false);
	expect(results).toStrictEqual([]);
});

test('flushes the tail chunk with isLast and rethrows upload errors', async () => {
	const uploadError = new Error('chunk failed');
	let lastFlag: boolean | undefined;
	try {
		await chunkedUpload({
			chunkSize: 4,
			concurrency: 1,
			uploadChunk: (_chunk, _index, _offset, isLast) => {
				lastFlag = isLast;
				return Promise.reject(uploadError);
			},
			value: streamOf([new Uint8Array(3)]),
		});
	} catch (error) {
		expect(error).toBe(uploadError);
	}
	expect(lastFlag).toBe(true);
});

test('concatBinary helper accumulates stream chunks back into the original bytes', () => {
	const merged = concatBinary(new Uint8Array([1, 2]), new Uint8Array([3]));
	expect(merged).toStrictEqual(new Uint8Array([1, 2, 3]));
});
