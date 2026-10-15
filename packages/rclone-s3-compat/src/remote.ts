import type {
	Binary,
	FileStat,
	FolderStat,
	Fs,
	InputAtom,
	ListReporter,
	Stat,
	WrappedFs,
} from '@hesprs/sync-engine-sdk';
import { isFolder } from '@repo/shared/path';
import nonEmptyFolders from '@/directories';
import { msToSeconds, secondsToMs } from '@/times';
import UploadListings from '@/upload-listings';

/**
 * Adapts S3Fs for `rclone serve s3`:
 * - Converts `x-amz-meta-mtime` between Sync Engine milliseconds and rclone seconds.
 * - Skips directory marker creation (rclone creates zero-byte files, not folders).
 * - Skips folder moves (rclone CopyObject rejects trailing-slash keys).
 * - Infers parent folders in listings (rclone returns no directory entries).
 *
 * Directory fixes are unnecessary when asymmetric storage is enabled.
 * Timestamp conversion passes through non-numeric values (e.g. encrypted meta) unchanged.
 */
export default class RcloneFs implements WrappedFs {
	private readonly uploadListings: UploadListings;

	constructor(
		readonly original: Fs,
		private readonly needDirFix: boolean,
		private readonly ignoreEtags = false,
	) {
		this.uploadListings = new UploadListings(original);
	}

	getUid() {
		return this.original.getUid();
	}

	read(key: string, stat: FileStat) {
		if (this.ignoreEtags) this.uploadListings.observeRead(stat.key, key);
		return this.original.read(key, stat);
	}

	readStream(key: string, stat: FileStat) {
		return this.original.readStream(key, stat);
	}

	async write(key: string, value: Binary, stat: FileStat) {
		return this.upload(key, async () =>
			this.original.write(key, value, convertWriteStat(stat)),
		);
	}

	async writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		return this.upload(key, async () =>
			this.original.writeStream(key, value, convertWriteStat(stat)),
		);
	}

	prepareUploads(atoms: Array<InputAtom>) {
		if (this.ignoreEtags) this.uploadListings.prepare(atoms);
	}

	finishUpload(taskKey: string) {
		this.uploadListings.finishTask(taskKey);
	}

	cancelUploads() {
		this.uploadListings.cancel();
	}

	private async upload(key: string, execute: () => Promise<string>) {
		let listing: Promise<Array<Stat>> | undefined;
		let uid: string;
		try {
			uid = await execute();
		} finally {
			// The optimizer can register the batch while execute() is waiting for its flush.
			listing = this.uploadListings.finishWrite(key);
		}
		if (!this.ignoreEtags) return uid;
		return (await this.listedStat(key, listing)).uid;
	}

	delete(key: string) {
		return this.original.delete(key);
	}

	mkdir(key: string, stat: FolderStat, recursive?: boolean) {
		if (this.needDirFix) return;
		return this.original.mkdir(key, stat, recursive);
	}

	move(oldKey: string, newKey: string) {
		if (this.needDirFix && isFolder(oldKey)) return;
		return this.original.move(oldKey, newKey);
	}

	async stat(key: string) {
		if (this.ignoreEtags && !isFolder(key)) return this.listedStat(key);
		return decorate(await this.original.stat(key));
	}

	private async listedStat(key: string, batch?: Promise<Array<Stat>>): Promise<FileStat> {
		const stats = await (batch ??
			this.original.list(key, ({ current }) => (current === key ? 'include' : 'exclude')));
		const stat = stats.find((entry) => entry.key === key);
		if (!stat || stat.isDir)
			throw Object.assign(new Error(`File "${key}" not found in S3 listing.`), {
				status: 404,
			});
		return decorate(stat, true, true);
	}

	exists(key: string) {
		return this.original.exists(key);
	}

	async list(key: string, reporter: ListReporter) {
		const stats = await this.original.list(key, reporter);
		const decorated = stats.map((stat) => decorate(stat, this.ignoreEtags, true));
		if (!this.needDirFix) return decorated;
		const entries = new Map(decorated.map((stat) => [stat.key, stat]));
		for (const folder of nonEmptyFolders(stats)) {
			if (folder === key || entries.has(folder)) continue;
			if (key !== '/' && !folder.startsWith(key)) continue;
			// Report inferred folders so downstream organizers keep them instead of dropping silently.
			if (
				(await reporter({
					completed: stats.length,
					current: folder,
					total: stats.length,
				})) === 'exclude'
			)
				continue;
			entries.set(folder, { isDir: true, key: folder, meta: () => ({}) });
		}
		return [...entries.values()];
	}
}

function convertWriteStat(stat: FileStat): FileStat {
	return {
		...stat,
		meta: async () => {
			const meta = { ...(await stat.meta()) };
			const seconds = msToSeconds(meta.mtime ?? String(stat.mtime));
			if (seconds !== undefined) meta.mtime = seconds;
			return meta;
		},
	};
}

function decorate(stat: FileStat, ignoreEtags?: boolean, fromList?: boolean): FileStat;
function decorate(stat: Stat, ignoreEtags?: boolean, fromList?: boolean): Stat;
function decorate(stat: Stat, ignoreEtags = false, fromList = false): Stat {
	if (stat.isDir) return stat;
	const originalMeta = stat.meta;
	return {
		...stat,
		meta: async () => {
			const meta = { ...(await originalMeta()) };
			const ms = secondsToMs(meta.mtime);
			// LIST preserves milliseconds; HEAD/GET may report a different or rounded time.
			if (fromList && (meta.mtime === undefined || ms !== undefined))
				meta.mtime = String(stat.mtime);
			else if (ms !== undefined) meta.mtime = ms;
			return meta;
		},
		uid: ignoreEtags ? `${stat.mtime}~${stat.size}` : stat.uid,
	};
}
