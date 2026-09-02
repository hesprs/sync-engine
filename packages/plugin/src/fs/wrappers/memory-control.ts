import type { Binary, FileStat, MaybePromise } from '@/types';
import type { Fs, ListReporter, WrappedFs } from '../interface';

type HangingOperation = {
	/** Memory reservation, capped at `STREAM_RESERVATION_SIZE`. */
	size: number;
	/** Transfer size, larger operations resume first. */
	priority: number;
	resume: () => void;
};

export type MemoryControlSharedState = {
	memoryConsumption: number;
	hangingOperations: Array<HangingOperation>;
	maxMemory: number;
};

const STREAM_RESERVATION_SIZE = 16 * 1024 * 1024;

function canReserve(state: MemoryControlSharedState, size: number) {
	const { memoryConsumption, maxMemory } = state;
	return memoryConsumption + size <= maxMemory || memoryConsumption === 0;
}

function insertHangingOperation(state: MemoryControlSharedState, operation: HangingOperation) {
	const { hangingOperations } = state;
	let index = 0;
	while (
		index < hangingOperations.length &&
		hangingOperations[index].priority >= operation.priority
	)
		index += 1;
	hangingOperations.splice(index, 0, operation);
}

function resumeHangingOperations(state: MemoryControlSharedState) {
	const { hangingOperations } = state;
	// Largest transfers first, but keep backfilling smaller ones into leftover budget instead of stopping at the first operation that does not fit.
	for (let index = 0; index < hangingOperations.length;) {
		const operation = hangingOperations[index];
		if (!canReserve(state, operation.size)) {
			index += 1;
			continue;
		}
		hangingOperations.splice(index, 1);
		state.memoryConsumption += operation.size;
		operation.resume();
	}
}

function reserveMemory(state: MemoryControlSharedState, stat: FileStat) {
	const size = Math.min(stat.size, STREAM_RESERVATION_SIZE);
	if (canReserve(state, size)) {
		state.memoryConsumption += size;
		return Promise.resolve();
	}

	return new Promise<void>((resolve) => {
		insertHangingOperation(state, {
			priority: stat.size,
			resume: () => resolve(),
			size,
		});
	});
}

function releaseMemory(state: MemoryControlSharedState, stat: FileStat) {
	const size = Math.min(stat.size, STREAM_RESERVATION_SIZE);
	state.memoryConsumption = Math.max(0, state.memoryConsumption - size);
	resumeHangingOperations(state);
}

class MemoryControlRemoteFs implements WrappedFs {
	constructor(
		readonly original: Fs,
		private readonly state: MemoryControlSharedState,
	) {}

	private async readThroughMemory<T>(read: () => MaybePromise<T>, stat: FileStat) {
		await reserveMemory(this.state, stat);
		try {
			return await read();
		} catch (error) {
			releaseMemory(this.state, stat);
			throw error;
		}
	}

	private async writeThroughMemory<T>(write: () => MaybePromise<T>, stat: FileStat) {
		try {
			return await write();
		} finally {
			releaseMemory(this.state, stat);
		}
	}

	getUid() {
		return this.original.getUid();
	}

	read(key: string, stat: FileStat) {
		return this.readThroughMemory(() => this.original.read(key, stat), stat);
	}

	readStream(key: string, stat: FileStat) {
		return this.readThroughMemory(() => this.original.readStream(key, stat), stat);
	}

	write(key: string, value: Binary, stat: FileStat) {
		return this.writeThroughMemory(() => this.original.write(key, value, stat), stat);
	}

	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		return this.writeThroughMemory(() => this.original.writeStream(key, value, stat), stat);
	}

	delete(key: string) {
		return this.original.delete(key);
	}

	move(oldKey: string, newKey: string) {
		return this.original.move(oldKey, newKey);
	}

	mkdir(key: string, recursive?: boolean) {
		return this.original.mkdir(key, recursive);
	}

	stat(key: string) {
		return this.original.stat(key);
	}

	exists(key: string) {
		return this.original.exists(key);
	}

	list(key: string, reporter: ListReporter) {
		return this.original.list(key, reporter);
	}
}

export default function memoryControlWrapper(
	original: Fs,
	state: MemoryControlSharedState,
): WrappedFs {
	return new MemoryControlRemoteFs(original, state);
}
