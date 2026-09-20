import type { Binary } from './binary';
import { concatBinary } from './binary';

type ChunkedUploadOptions<Result> = {
	chunkSize: number;
	concurrency: number;
	value: ReadableStream<Binary>;
	/**
	 * Upload one chunk. `index` counts from 1; `offset` is the chunk's byte
	 * offset from the stream start; `isLast` marks the final chunk (which may
	 * be smaller than `chunkSize`).
	 */
	uploadChunk: (chunk: Binary, index: number, offset: number, isLast: boolean) => Promise<Result>;
	onChunkResult?: (result: Result, index: number) => void;
};

/**
 * Streams `value` through fixed-size chunks uploaded with bounded concurrency.
 * Buffer stays bounded at `chunkSize` + one stream chunk: reads pause whenever
 * a concurrency slot is taken or the buffer holds a full chunk.
 *
 * Resolves with results in chunk order once the stream is drained. Empty
 * streams resolve with no results.
 */
export default async function chunkedUpload<Result>({
	chunkSize,
	concurrency,
	value,
	uploadChunk,
	onChunkResult,
}: ChunkedUploadOptions<Result>): Promise<Array<Result>> {
	const reader = value.getReader();
	const inFlight = new Set<Promise<void>>();
	const results: Array<Result | undefined> = [];
	let nextChunkIndex = 1;
	let offset = 0;
	let pending: Binary = new Uint8Array(0);
	let failure: { error: unknown } | undefined;

	const trackUpload = (promise: Promise<void>) => {
		inFlight.add(promise);
		promise.then(
			() => inFlight.delete(promise),
			() => {},
		);
	};

	const waitForSlot = async () => {
		while (inFlight.size >= concurrency) await Promise.race(inFlight);
	};

	const enqueueChunk = (chunk: Binary, isLast: boolean) => {
		const index = nextChunkIndex++;
		const chunkOffset = offset;
		offset += chunk.byteLength;
		trackUpload(
			uploadChunk(chunk, index, chunkOffset, isLast).then(
				(result) => {
					results[index - 1] = result;
					onChunkResult?.(result, index);
				},
				(error: unknown) => {
					failure ??= { error };
				},
			),
		);
	};

	try {
		let done = false;
		while (!done)
			if (failure) break;
			else if (inFlight.size >= concurrency) await Promise.race(inFlight);
			else if (pending.byteLength >= chunkSize) {
				const chunk = pending.slice(0, chunkSize);
				pending = pending.slice(chunkSize);
				enqueueChunk(chunk, false);
			} else {
				const read = await reader.read();
				if (read.done) done = true;
				else pending = concatBinary(pending, read.value);
			}

		if (!failure && pending.byteLength > 0) {
			await waitForSlot();
			enqueueChunk(pending, true);
			pending = new Uint8Array(0);
		}
		await Promise.all(inFlight);
		if (failure) throw failure.error;
	} catch (error) {
		await Promise.allSettled(inFlight);
		throw error;
	} finally {
		reader.releaseLock();
	}
	return results as Array<Result>;
}
