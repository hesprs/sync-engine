import type {
	BatchOptimizer,
	DeleteAtom,
	InputAtom,
	Fs,
	WrappedFs,
	MkdirAtom,
	MoveAtom,
	WriteAtom,
	OutputAtom,
	ListReporter,
} from '../interface';
import type { MaybePromise, Binary, FileStat, FolderStat } from '@/types';

type Omitted<T> = Omit<T, 'resolve' | 'reject'>;

const executeAtom = ({ execute }: OutputAtom) => {
	const result = execute();
	if (result instanceof Promise) return result;
	return Promise.resolve(result);
};

class OptimizationFs implements WrappedFs {
	private scheduled = false;
	private readonly queue: Array<InputAtom> = [];

	constructor(
		readonly original: Fs,
		private readonly optimizer: BatchOptimizer,
	) {}

	getUid() {
		return this.original.getUid();
	}

	private enqueueExecution<T extends InputAtom>({ execute: e, ...rest }: Omitted<T>) {
		const { defer, execute, resolve, reject } = createCachedPromise(e as never);
		this.queue.push({ ...rest, execute, reject, resolve } as never);
		this.scheduleFlush();
		return defer as ReturnType<T['execute']>;
	}

	read(key: string, stat: FileStat) {
		return this.original.read(key, stat);
	}

	readStream(key: string, stat: FileStat) {
		return this.original.readStream(key, stat);
	}

	delete(key: string) {
		return this.enqueueExecution<DeleteAtom>({
			execute: () => this.original.delete(key),
			key,
			type: 'delete',
		});
	}

	mkdir(key: string, stat: FolderStat, recursive?: boolean) {
		return this.enqueueExecution<MkdirAtom>({
			execute: () => this.original.mkdir(key, stat, recursive),
			key,
			type: 'mkdir',
		});
	}

	write(key: string, value: MaybePromise<Binary>, stat: FileStat) {
		// The queued write does not await the value until it executes, so catch rejections here to keep them from being reported as unhandled.
		if (value instanceof Promise) void value.catch(() => {});
		return this.enqueueExecution<WriteAtom>({
			execute: () => this.original.write(key, value, stat),
			key,
			type: 'write',
		});
	}

	writeStream(key: string, value: MaybePromise<ReadableStream<Binary>>, stat: FileStat) {
		if (value instanceof Promise) void value.catch(() => {});
		return this.enqueueExecution<WriteAtom>({
			execute: () => this.original.writeStream(key, value, stat),
			key,
			type: 'write',
		});
	}

	move(oldKey: string, newKey: string) {
		return this.enqueueExecution<MoveAtom>({
			execute: () => this.original.move(oldKey, newKey),
			newKey,
			oldKey,
			type: 'move',
		});
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

	private scheduleFlush() {
		if (this.scheduled) return;
		this.scheduled = true;
		// Drain microtask
		window.setTimeout(() => {
			void this.flush().catch(() => {});
			this.scheduled = false;
		}, 0);
	}

	private async flush() {
		if (this.queue.length === 1) {
			await this.queue.pop()?.execute();
			return;
		}
		const optimizedAtoms = this.optimizer({
			atoms: this.queue.splice(0),
			executeAtom,
			fs: this.original,
		});
		await Promise.all(optimizedAtoms.map(executeAtom));
	}
}

function createCachedPromise<T>(fn: () => MaybePromise<T>) {
	// oxlint-disable-next-line unicorn/no-null use null since functions can return `undefined`
	let promise: MaybePromise<T> | null = null;
	let resolve: (value: T) => void;
	let reject: (reason: Error) => void;
	const defer = new Promise<T>((resolver, rejector) => {
		resolve = resolver;
		reject = rejector;
	});
	const execute = () => {
		if (promise !== null) return promise;
		promise = fn();
		if (promise instanceof Promise) promise.then(resolve, reject);
		else resolve(promise);
		return promise;
	};
	return {
		defer,
		execute,
		reject: (reason: Error) => {
			// oxlint-disable-next-line unicorn/no-null
			promise = null;
			reject(reason);
		},
		resolve: (value: T) => {
			promise = value;
			resolve(value);
		},
	};
}

export default function optimizationWrapper(original: Fs, options: BatchOptimizer): WrappedFs {
	return new OptimizationFs(original, options);
}
