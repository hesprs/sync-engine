import type { Binary, FileStat, Fs, ListReporter, WrappedFs } from '@hesprs/sync-engine-sdk';

export default class PassthroughFs implements WrappedFs {
	constructor(readonly original: Fs) {}
	getUid() {
		return this.original.getUid();
	}
	read(key: string, stat: FileStat) {
		return this.original.read(key, stat);
	}
	readStream(key: string, stat: FileStat) {
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
