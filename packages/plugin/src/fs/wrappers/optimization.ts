import type { MaybePromise, Binary, FileStat } from '@/types';
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

type OptimizationOptions = {
	thisPool: Set<string>;
	batchOptimizer: BatchOptimizer;
};
type OptimizationCompanionOptions = {
	thatPool: Set<string>;
	getThatFs: () => Fs;
};

type Omitted<T> = Omit<T, 'resolve' | 'reject'>;

const executeAtom = ({ execute }: OutputAtom) => {
	const result = execute();
	if (result instanceof Promise) return result;
	return Promise.resolve(result);
};

class OptimizationFs implements WrappedFs {
	private scheduled = false;
	private readonly writeKeys: Array<string> = [];
	private readonly queue: Array<InputAtom> = [];
	private readonly pendingWrites = new Map<
		string,
		(write: () => MaybePromise<string>) => Promise<string>
	>();

	constructor(
		readonly original: Fs,
		private readonly options: OptimizationOptions,
	) {}

	getUid() {
		return this.original.getUid();
	}

	private enqueueExecution({
		execute: e,
		...rest
	}: Omitted<MoveAtom> | Omitted<DeleteAtom> | Omitted<MkdirAtom>) {
		const { defer, execute, resolve, reject } = createCachedPromise(e);
		this.queue.push({ ...rest, execute, reject, resolve });
		this.scheduleFlush();
		return defer;
	}

	read(key: string, stat: FileStat) {
		// Terminate the needle and obtain transformed key
		const { thisPool } = this.options;
		if (thisPool.has(stat.key)) {
			this.writeKeys.push(key);
			thisPool.delete(stat.key);
			this.scheduleFlush();
			throw new Error('Terminate key needle.');
		}
		return this.original.read(key, stat);
	}

	readStream(key: string, stat: FileStat) {
		return this.original.readStream(key, stat);
	}

	delete(key: string) {
		return this.enqueueExecution({
			execute: () => this.original.delete(key),
			key,
			type: 'delete',
		});
	}

	mkdir(key: string, recursive?: boolean) {
		return this.enqueueExecution({
			execute: () => this.original.mkdir(key, recursive),
			key,
			type: 'mkdir',
		});
	}

	write(key: string, value: Binary, stat: FileStat) {
		const anticipated = this.pendingWrites.get(key);
		if (anticipated) return anticipated(() => this.original.write(key, value, stat));
		return this.original.write(key, value, stat);
	}

	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		const anticipated = this.pendingWrites.get(key);
		if (anticipated) return anticipated(() => this.original.writeStream(key, value, stat));
		return this.original.writeStream(key, value, stat);
	}

	move(oldKey: string, newKey: string) {
		return this.enqueueExecution({
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
		if (this.queue.length + this.writeKeys.length === 1) {
			const queueItem = this.queue.pop();
			if (queueItem) await queueItem.execute();
			this.writeKeys.length = 0;
			return;
		}
		const writeAtoms = this.writeKeys.splice(0).map((key): WriteAtom => {
			let result: string | undefined;
			let anticipatedError: Error | undefined;
			let rejectInner: ((reason: Error) => void) | undefined;
			const anticipateWrite = new Promise<() => MaybePromise<string>>((resolve, reject) => {
				this.pendingWrites.set(key, (write: () => MaybePromise<string>) => {
					this.pendingWrites.delete(key);
					const {
						execute,
						defer,
						resolve: resolveWrite,
						reject: rejectWrite,
					} = createCachedPromise(write);
					rejectInner = rejectWrite;
					if (anticipatedError) {
						rejectWrite(anticipatedError);
						reject(anticipatedError);
					} else {
						if (result !== undefined) resolveWrite(result);
						resolve(execute);
					}
					return defer;
				});
			});
			return {
				execute: () => anticipateWrite.then((write) => write()),
				key,
				reject: (error: Error) => {
					result = undefined;
					anticipatedError = error;
					rejectInner?.(error);
				},
				resolve: (uid: string) => (result = uid),
				type: 'write',
			};
		});
		const atoms = [...this.queue.splice(0), ...writeAtoms];
		const optimizedAtoms = this.options.batchOptimizer({
			atoms,
			executeAtom,
			fs: this.original,
		});
		await Promise.all(optimizedAtoms.map(executeAtom));
	}
}

// Write operation always cannot reach the optimization wrapper before the flush because they need opposite side to read, which yields. Companion wrapper observes reads and dispatches needle reads to the opposite side FS as an anticipation of write, and allows it to obtain ahead-of-time transformed write keys
class OptimizationCompanionFs implements WrappedFs {
	constructor(
		readonly original: Fs,
		private readonly options: OptimizationCompanionOptions,
	) {}

	getUid() {
		return this.original.getUid();
	}
	read(key: string, stat: FileStat) {
		this.options.thatPool.add(stat.key);
		// Dispatch a explore needle to opposite FS to observe the transformed key
		attempt(() => this.options.getThatFs().read(key, stat));
		return this.original.read(key, stat);
	}
	readStream(key: string, stat: FileStat) {
		this.options.thatPool.add(stat.key);
		attempt(() => this.options.getThatFs().read(key, stat));
		return this.original.readStream(key, stat);
	}
	write(key: string, value: Binary, stat: FileStat) {
		return this.original.write(key, value, stat);
	}
	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		return this.original.writeStream(key, value, stat);
	}
	delete(key: string) {
		return this.original.delete(key);
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
	move(oldKey: string, newKey: string) {
		return this.original.move(oldKey, newKey);
	}
}

export function optimizationCompanionWrapper(
	original: Fs,
	options: OptimizationCompanionOptions,
): Fs {
	return new OptimizationCompanionFs(original, options);
}

function attempt(fn: () => unknown) {
	try {
		const result = fn();
		if (result instanceof Promise) result.catch(() => {});
	} catch {
		// Will be terminated by deeper optimizer and throw definitely
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

export function optimizationWrapper(original: Fs, options: OptimizationOptions): WrappedFs {
	return new OptimizationFs(original, options);
}
