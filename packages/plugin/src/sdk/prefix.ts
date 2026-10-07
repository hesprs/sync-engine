import { normalizeBaseDir } from '@repo/shared/path';
import type { Fs, ListReporter, WrappedFs } from '@/fs';
import type { Binary, FileStat, FolderStat, MaybePromise, Stat } from '@/types';

function joinKey(prefix: string, key: string): string {
	return key === '/' ? prefix : prefix === '/' ? key : `${prefix}${key}`;
}

function stripKey(prefix: string, key: string): string {
	if (prefix === '/') return key;
	if (!key.startsWith(prefix)) throw new Error(`Accessed out-of-scope path "${key}"`);
	key = key.slice(prefix.length);
	return key === '' ? '/' : key;
}

function stripKeyFromStat(prefix: string, stat: Stat): Stat {
	return Object.assign(stat, { key: stripKey(prefix, stat.key) });
}

function stripKeyFromStats(prefix: string, stats: Array<Stat>): Array<Stat> {
	return stats.map((stat) => stripKeyFromStat(prefix, stat)).filter((stat) => stat.key !== '/');
}

class PrefixFs implements WrappedFs {
	constructor(
		readonly original: Fs,
		private readonly prefix: string, // Must be a unified key directory
	) {}

	getUid(): string {
		return `${this.original.getUid()}~${this.prefix}`;
	}

	read(key: string, stat: FileStat) {
		return this.original.read(joinKey(this.prefix, key), stat);
	}

	readStream(key: string, stat: FileStat) {
		return this.original.readStream(joinKey(this.prefix, key), stat);
	}

	write(key: string, value: Binary, stat: FileStat) {
		return this.original.write(joinKey(this.prefix, key), value, stat);
	}

	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		return this.original.writeStream(joinKey(this.prefix, key), value, stat);
	}

	delete(key: string) {
		return this.original.delete(joinKey(this.prefix, key));
	}

	move(oldKey: string, newKey: string) {
		return this.original.move(joinKey(this.prefix, oldKey), joinKey(this.prefix, newKey));
	}

	mkdir(key: string, stat: FolderStat, recursive?: boolean) {
		return this.original.mkdir(joinKey(this.prefix, key), stat, recursive);
	}

	async stat(key: string) {
		const stat = await this.original.stat(joinKey(this.prefix, key));
		return stripKeyFromStat(this.prefix, stat);
	}

	exists(key: string): MaybePromise<boolean> {
		return this.original.exists(joinKey(this.prefix, key));
	}

	async list(key: string, reporter: ListReporter) {
		const stats = await this.original.list(joinKey(this.prefix, key), (progress) =>
			reporter(
				Object.assign(progress, {
					current: stripKey(this.prefix, progress.current),
				}),
			),
		);
		return stripKeyFromStats(this.prefix, stats);
	}
}

export default function prefixWrapper(original: Fs, prefix: string): WrappedFs {
	const normalizedPrefix = normalizeBaseDir(prefix);
	return new PrefixFs(original, normalizedPrefix);
}
