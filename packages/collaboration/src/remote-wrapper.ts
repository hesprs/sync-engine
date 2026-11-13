import type { RaceJournal } from '@/race';
import type RemoteStateCache from '@/state-cache';
import type {
	Binary,
	FileStat,
	FolderStat,
	Fs,
	ListReporter,
	WrappedFs,
} from '@hesprs/sync-engine-sdk';

export type CaptureOptions = {
	activeUploads: ReadonlySet<string>;
	enabled: () => boolean;
	journal: RaceJournal;
	stateCache: RemoteStateCache;
};

class CapturingRemoteFs implements WrappedFs {
	private readonly uid: string;

	constructor(
		readonly original: Fs,
		private readonly options: CaptureOptions,
	) {
		this.uid = original.getUid();
	}

	getUid(): string {
		return this.uid;
	}

	async read(key: string, stat: FileStat) {
		return this.original.read(key, stat);
	}

	readStream(key: string, stat: FileStat) {
		return this.original.readStream(key, stat);
	}

	async write(key: string, value: Binary, stat: FileStat): Promise<string> {
		const capture = this.shouldCapture(key, stat);
		const uid = await this.original.write(key, value, stat);
		this.options.stateCache.onWrite(this.uid, key);
		if (capture) this.captureUpload(key, uid, stat);
		return uid;
	}

	async writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat): Promise<string> {
		const capture = this.shouldCapture(key, stat);
		const uid = await this.original.writeStream(key, value, stat);
		this.options.stateCache.onWrite(this.uid, key);
		if (capture) this.captureUpload(key, uid, stat);
		return uid;
	}

	async delete(key: string): Promise<void> {
		await this.original.delete(key);
		this.options.stateCache.onDelete(this.uid, key);
		this.options.journal.delete(key);
	}

	async move(oldKey: string, newKey: string): Promise<void> {
		await this.original.move(oldKey, newKey);
		this.options.stateCache.onMove(this.uid, oldKey, newKey);
		const epoch = this.options.journal.get(oldKey);
		if (epoch) {
			this.options.journal.delete(oldKey);
			this.options.journal.record({ ...epoch, key: newKey });
		}
	}

	async mkdir(key: string, stat: FolderStat, recursive?: boolean): Promise<void> {
		await this.original.mkdir(key, stat, recursive);
		this.options.stateCache.onMkdir(this.uid, key);
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

	private shouldCapture(key: string, stat: FileStat): boolean {
		return this.options.enabled() && this.options.activeUploads.has(key) && !stat.isDir;
	}

	private captureUpload(key: string, remoteUid: string, stat: FileStat): void {
		this.options.journal.record({ key, localUid: stat.uid, remoteUid, uploadedAt: Date.now() });
	}
}

export default function captureRemoteState(original: Fs, options: CaptureOptions): WrappedFs {
	return new CapturingRemoteFs(original, options);
}
