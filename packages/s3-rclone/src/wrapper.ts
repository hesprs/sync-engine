import type {
	Binary,
	FileStat,
	FolderStat,
	Fs,
	ListReporter,
	Stat,
	WrappedFs,
} from '@hesprs/sync-engine-sdk';

export type SaveFile = (stat: FileStat) => string | Promise<string>;

export default abstract class MetadataFs implements WrappedFs {
	constructor(readonly original: Fs) {}
	protected abstract decorate(stat: Stat): Stat;
	protected abstract save(key: string, stat: FileStat, action: SaveFile): Promise<string>;
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
		return this.save(key, stat, (source) => this.original.write(key, value, source));
	}
	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		return this.save(key, stat, (source) => this.original.writeStream(key, value, source));
	}
	delete(key: string) {
		return this.original.delete(key);
	}
	move(oldKey: string, newKey: string) {
		return this.original.move(oldKey, newKey);
	}
	mkdir(key: string, stat: FolderStat, recursive?: boolean) {
		return this.original.mkdir(key, stat, recursive);
	}
	async stat(key: string) {
		return this.decorate(await this.original.stat(key));
	}
	exists(key: string) {
		return this.original.exists(key);
	}
	async list(key: string, reporter: ListReporter) {
		return (await this.original.list(key, reporter)).map((stat) => this.decorate(stat));
	}
}
