import type { Binary } from './binary';

type CreateRangeReadStreamOptions = {
	size: number;
	chunkSize: number;
	concurrency: number;
	requestRange: (start: number, endInclusive: number) => Promise<Binary>;
	finalize?: () => Promise<void> | void;
};

export default function createRangeReadStream({
	size,
	chunkSize,
	concurrency,
	requestRange,
	finalize,
}: CreateRangeReadStreamOptions): ReadableStream<Binary> {
	const totalChunks = size === 0 ? 0 : Math.ceil(size / chunkSize);
	const maxBufferedBytes = chunkSize * concurrency;
	let finalized = false;
	const runFinalize = () => {
		if (!finalize || finalized) return;
		finalized = true;
		try {
			const result = finalize();
			if (result instanceof Promise) result.catch(() => {});
		} catch {
			// Best-effort and silence errors
		}
	};
	if (totalChunks === 0) {
		runFinalize();
		return new ReadableStream<Binary>({
			start(controller) {
				controller.close();
			},
		});
	}

	let controllerRef: ReadableStreamDefaultController<Binary> | undefined;
	let nextChunkIndex = 0;
	let nextPendingIndex = 0;
	let inFlight = 0;
	let closed = false;
	let consumerReady = false;
	let pendingBytes = 0;
	const pending = new Map<number, Binary>();

	const closeIfDone = () => {
		if (closed || !controllerRef) return;
		if (nextPendingIndex < totalChunks || inFlight > 0) return;
		closed = true;
		controllerRef.close();
		runFinalize();
	};

	const flush = () => {
		if (!controllerRef || closed) return;
		while (consumerReady && pending.has(nextPendingIndex)) {
			const chunk = pending.get(nextPendingIndex);
			if (!chunk) break;
			pending.delete(nextPendingIndex);
			pendingBytes -= chunk.byteLength;
			controllerRef.enqueue(chunk);
			consumerReady = (controllerRef.desiredSize ?? 0) > 0;
			nextPendingIndex++;
		}
		closeIfDone();
	};

	const canScheduleNext = () =>
		controllerRef &&
		!closed &&
		consumerReady &&
		inFlight < concurrency &&
		nextChunkIndex < totalChunks &&
		pendingBytes < maxBufferedBytes;

	const requestChunk = (currentIndex: number) => {
		inFlight++;

		const start = currentIndex * chunkSize;
		const endInclusive = Math.min(start + chunkSize - 1, size - 1);

		void requestRange(start, endInclusive)
			.then((buffer) => {
				if (closed) return;
				if (buffer.byteLength !== endInclusive - start + 1)
					throw new Error('Ranged request does not return content with correct length!');
				pending.set(currentIndex, buffer);
				pendingBytes += buffer.byteLength;
				inFlight--;
				flush();
				schedule();
			})
			.catch((error: unknown) => {
				if (closed) return;
				closed = true;
				controllerRef?.error(error);
				runFinalize();
			});
	};

	const schedule = () => {
		while (canScheduleNext()) {
			const currentIndex = nextChunkIndex;
			nextChunkIndex++;
			requestChunk(currentIndex);
		}
	};

	return new ReadableStream<Binary>(
		{
			cancel() {
				closed = true;
				runFinalize();
			},
			pull(controller) {
				controllerRef = controller;
				consumerReady = true;
				flush();
				schedule();
			},
			start(controller) {
				controllerRef = controller;
			},
		},
		{ highWaterMark: 0 },
	);
}
