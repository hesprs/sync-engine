import type {
	Binary,
	FileStat,
	FolderStat,
	Fs,
	ListReporter,
	Stat,
	WrappedFs,
} from '@hesprs/sync-engine-sdk';

/**
 * Adapts S3Fs for `rclone serve s3`:
 *
 * - Converts `x-amz-meta-mtime` between Sync Engine milliseconds and rclone seconds. Timestamp
 *   conversion passes through non-numeric values (e.g. encrypted meta) unchanged.
 * - Refills missing `mtime` meta from the listing's time: `rclone serve s3` keeps object metadata in
 *   memory only, so it disappears on server restarts while the disk modtime survives.
 */
export default class RcloneFs implements WrappedFs {
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
	async write(key: string, value: Binary, stat: FileStat) {
		return this.original.write(key, value, await convertWriteStat(stat));
	}
	async writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		return this.original.writeStream(key, value, await convertWriteStat(stat));
	}
	delete(key: string) {
		return this.original.delete(key);
	}
	mkdir(key: string, stat: FolderStat, recursive?: boolean) {
		return this.original.mkdir(key, stat, recursive);
	}
	move(oldKey: string, newKey: string) {
		return this.original.move(oldKey, newKey);
	}
	stat(key: string) {
		return this.original.stat(key);
	}
	exists(key: string) {
		return this.original.exists(key);
	}
	async list(key: string, reporter: ListReporter) {
		const stats = await this.original.list(key, reporter);
		return stats.map((stat) => convertReadStat(stat));
	}
}

async function convertWriteStat(stat: FileStat): Promise<FileStat> {
	const meta = { ...(await stat.meta()) };
	const seconds = msToSeconds(meta.mtime);
	if (seconds !== undefined) meta.mtime = seconds;
	return { ...stat, meta: () => meta };
}

function convertReadStat(stat: Stat): Stat {
	if (stat.isDir) return stat;
	const originalMeta = stat.meta;
	return {
		...stat,
		meta: async () => {
			const meta = { ...(await originalMeta()) };
			meta.mtime = secondsToMs(meta.mtime) ?? meta.mtime ?? String(stat.mtime);
			return meta;
		},
	};
}

function msToSeconds(ms: string | undefined): string | undefined {
	if (!ms) return;
	const n = Number(ms);
	if (!Number.isFinite(n)) return;
	return String(n / 1000);
}

function secondsToMs(seconds: string | undefined): string | undefined {
	if (!seconds) return;
	const n = Number(seconds);
	if (!Number.isFinite(n)) return;
	// Math.round absorbs float-multiply artifacts (e.g. 1700000123.456 * 1000).
	return String(Math.round(n * 1000));
}
