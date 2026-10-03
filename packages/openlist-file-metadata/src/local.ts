import type {
	Binary,
	FileStat,
	Fs,
	ListReporter,
	Stat,
	VaultRequest,
} from '@hesprs/sync-engine-sdk';
import type { FileTimes } from './times';
import { attachTimes, getTimes, readTimes, withTimes } from './times';
import PassthroughFs from './wrapper';

export class LocalSession {
	readonly observed = new Map<string, FileTimes>();
	readonly writing = new Map<string, FileTimes>();
	constructor(readonly enabled: () => boolean) {}
	clear() {
		this.observed.clear();
		this.writing.clear();
	}
}

export function localMiddleware(original: VaultRequest, session: LocalSession): VaultRequest {
	return async (key, params) => {
		if (!session.enabled()) return original(key, params);
		if (params?.method === 'STAT') {
			// The vault cache can still describe the file before our write.
			const stat = await original(key, {
				cached: session.writing.has(key) ? false : params.cached,
				ignoreCancellation: params.ignoreCancellation,
				method: 'STAT',
			});
			if (stat.type === 'file') session.observed.set(key, readTimes(stat));
			else session.observed.delete(key);
			return stat as never;
		}
		if (params?.method === 'PUT' || params?.method === 'APPEND') {
			const times = session.writing.get(key);
			return original(key, times ? { ...params, ...times } : params);
		}
		if (params?.method === 'MOVE') {
			const times = session.writing.get(params.destination);
			// Apply after the final append, before VaultFs renames its temporary
			// File and calculates the destination UID. Existing content is untouched.
			if (times)
				await original(key, { ...times, method: 'APPEND', value: new Uint8Array(0) });
		}
		return original(key, params);
	};
}

export default class MetadataLocalFs extends PassthroughFs {
	constructor(
		original: Fs,
		private readonly session: LocalSession,
	) {
		super(original);
	}
	private decorate(stat: Stat): Stat {
		if (stat.isDir || !this.session.enabled()) return stat;
		return attachTimes(stat, this.session.observed.get(stat.key) ?? { mtime: stat.mtime });
	}
	async stat(key: string) {
		return this.decorate(await this.original.stat(key));
	}
	async list(key: string, reporter: ListReporter) {
		this.session.observed.clear();
		return (await this.original.list(key, reporter)).map((stat) => this.decorate(stat));
	}
	write(key: string, value: Binary, stat: FileStat) {
		return this.save(key, stat, () => this.original.write(key, value, stat));
	}
	async writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		if (!this.session.enabled()) return this.original.writeStream(key, value, stat);
		// VaultFs only creates its temporary file when it receives a chunk.
		const source = value.pipeThrough(
			new TransformStream<Binary, Binary>({
				start: (controller) => controller.enqueue(new Uint8Array(0)),
			}),
		);
		return this.save(key, stat, () => this.original.writeStream(key, source, stat));
	}
	private save(key: string, stat: FileStat, action: () => string | Promise<string>) {
		return withTimes(
			this.session.writing,
			key,
			this.session.enabled() ? getTimes(stat) : undefined,
			action,
		);
	}
}
