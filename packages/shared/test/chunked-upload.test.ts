import { concatBinary } from '@/binary';
import chunkedUpload from '@/chunked-upload';
import { expect, test } from 'bun:test';
import type { Binary } from '@/binary';

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

test('marks the final full chunk as last when the stream ends on a chunk boundary', async () => {
	const uploads: Array<{ isLast: boolean; offset: number; size: number }> = [];
	await chunkedUpload({
		chunkSize: 4,
		concurrency: 2,
		uploadChunk: (chunk, _index, offset, isLast) => {
			uploads.push({ isLast, offset, size: chunk.byteLength });
			return Promise.resolve(chunk.byteLength);
		},
		value: streamOf([
			new Uint8Array(4).fill(1),
			new Uint8Array(2).fill(2),
			new Uint8Array(2).fill(3),
		]),
	});

	expect(uploads).toStrictEqual([
		{ isLast: false, offset: 0, size: 4 },
		{ isLast: true, offset: 4, size: 4 },
	]);
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

test('never enqueues a chunk above chunkSize and uploads every byte', async () => {
	const chunkSize = 4;
	const streamChunkSize = 3;
	const streamChunks = 10;
	const uploads: Array<{ isLast: boolean; size: number }> = [];
	const uploaded = await chunkedUpload({
		chunkSize,
		concurrency: 1,
		uploadChunk: (chunk, _index, _offset, isLast) => {
			uploads.push({ isLast, size: chunk.byteLength });
			return Promise.resolve(chunk.byteLength);
		},
		value: streamOf(
			Array.from({ length: streamChunks }, () => new Uint8Array(streamChunkSize)),
		),
	});

	expect(uploads).toStrictEqual([
		...Array.from({ length: 7 }, () => ({ isLast: false, size: chunkSize })),
		{ isLast: true, size: 2 },
	]);
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
