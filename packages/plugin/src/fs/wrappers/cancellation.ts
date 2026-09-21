import type { Ref } from 'synthkernel';
import type { MaybePromise, Binary, FileStat, General } from '@/types';
import { syncCancelledError } from '@/sync';
import type { Fs, ListReporter, WrappedFs } from '../interface';

function assertNotCancelled(isCancelled: Ref<boolean>) {
	if (isCancelled()) throw syncCancelledError;
}

class CancellationFs implements WrappedFs {
	constructor(
		readonly original: Fs,
		private readonly isCancelled: Ref<boolean>,
	) {}

	private async guardCancellation<T>(
		when: 'pre' | 'post' | 'both',
		operation: () => Promise<T> | T,
	) {
		if (when !== 'post') assertNotCancelled(this.isCancelled);
		const result = await operation();
		if (when !== 'pre') assertNotCancelled(this.isCancelled);
		return result;
	}

	getUid() {
		return this.original.getUid();
	}

	read(key: string, stat: FileStat) {
		return this.guardCancellation('pre', () => this.original.read(key, stat));
	}

	readStream(key: string, stat: FileStat) {
		return this.guardCancellation('pre', () => this.original.readStream(key, stat));
	}

	write(key: string, value: Binary, stat: FileStat) {
		return this.guardCancellation('post', () => this.original.write(key, value, stat));
	}

	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat): MaybePromise<string> {
		return this.guardCancellation('post', () => this.original.writeStream(key, value, stat));
	}

	delete(key: string) {
		return this.guardCancellation('both', () => this.original.delete(key));
	}

	move(oldKey: string, newKey: string) {
		return this.guardCancellation('both', () => this.original.move(oldKey, newKey));
	}

	mkdir(key: string, recursive?: boolean) {
		return this.guardCancellation('both', () => this.original.mkdir(key, recursive));
	}

	stat(key: string) {
		return this.guardCancellation('both', () => this.original.stat(key));
	}

	exists(key: string) {
		return this.guardCancellation('both', () => this.original.exists(key));
	}

	list(key: string, reporter: ListReporter) {
		return this.guardCancellation('both', () => this.original.list(key, reporter));
	}
}

export function cancellationMiddleware<
	T extends (...args: ReadonlyArray<General>) => Promise<General>,
>(request: T, isCancelled: Ref<boolean>): T {
	return ((...params: Parameters<T>) => {
		// Both `Request` and `VaultRequest` take options as their second argument.
		const options = params[1] as { ignoreCancellation?: boolean } | undefined;
		if (options?.ignoreCancellation) return request(...params);
		assertNotCancelled(isCancelled);
		const promise = new Promise<Awaited<ReturnType<T>>>((resolve, reject) => {
			const unsub = isCancelled.subscribe((cancelled) => {
				if (cancelled) {
					unsub();
					reject(new DOMException('Aborted', 'AbortError'));
				}
			});
			request(...params)
				.then(resolve)
				.catch(reject)
				.finally(unsub);
		});
		return promise;
	}) as T;
}

export function cancellationWrapper(original: Fs, isCancelled: Ref<boolean>): WrappedFs {
	return new CancellationFs(original, isCancelled);
}
