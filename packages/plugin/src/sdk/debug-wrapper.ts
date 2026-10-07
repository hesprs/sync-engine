import type { WrappedFs, Fs, ListReporter } from '@/fs';
import type { Binary, FileStat, FolderStat } from '@/types';

class DebugFs implements WrappedFs {
	constructor(
		readonly original: Fs,
		private readonly log: (content: string) => void,
	) {}

	getUid(): string {
		const uid = this.original.getUid();
		this.log(`getUid: ${uid}`);
		return uid;
	}

	read(key: string, stat: FileStat) {
		this.log(`read: key ${key}, stat ${JSON.stringify(stat, undefined, '\t')}`);
		return this.original.read(key, stat);
	}

	readStream(key: string, stat: FileStat) {
		this.log(`readStream: key ${key}, stat ${JSON.stringify(stat, undefined, '\t')}`);
		return this.original.readStream(key, stat);
	}

	async write(key: string, value: Binary, stat: FileStat) {
		const result = await this.original.write(key, value, stat);
		this.log(
			`write: key ${key}, stat ${JSON.stringify(stat, undefined, '\t')}, result ${result}`,
		);
		return result;
	}

	async writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		const result = await this.original.writeStream(key, value, stat);
		this.log(
			`write: key ${key}, stat ${JSON.stringify(stat, undefined, '\t')}, result ${result}`,
		);
		return result;
	}

	delete(key: string) {
		this.log(`delete: key ${key}`);
		return this.original.delete(key);
	}

	move(oldKey: string, newKey: string) {
		this.log(`move: oldKey ${oldKey}, newKey ${newKey}`);
		return this.original.move(oldKey, newKey);
	}

	mkdir(key: string, stat: FolderStat, recursive?: boolean) {
		this.log(`mkdir: key ${key}, recursive ${recursive}`);
		return this.original.mkdir(key, stat, recursive);
	}

	async stat(key: string) {
		const result = await this.original.stat(key);
		this.log(`stat: key ${key}, result\n${JSON.stringify(result, undefined, '\t')}`);
		return result;
	}

	async exists(key: string) {
		const result = await this.original.exists(key);
		this.log(`exists: key ${key}, result ${result}`);
		return result;
	}

	async list(key: string, reporter: ListReporter) {
		const result = await this.original.list(key, reporter);
		this.log(`list: key ${key}, result\n${JSON.stringify(result, undefined, '\t')}`);
		return result;
	}
}

export default function debugWrapper(original: Fs, log: (content: string) => void): WrappedFs {
	return new DebugFs(original, log);
}
