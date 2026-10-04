import type { Binary, FileStat, Fs, ListReporter, Request, Stat } from '@hesprs/sync-engine-sdk';
import { digOriginal } from '@hesprs/sync-engine-sdk';
import type { Target } from './target';
import type { FileTimes } from './times';
import { readDavTimes, requestCreationDate } from './dav';
import { s3MultipartResponse, s3ObjectResponse, s3Stat } from './s3';
import S3Listing from './s3-listing';
import { canonicalUrl, header, setHeaders } from './target';
import { attachTimes, getTimes, withTimes } from './times';
import PassthroughFs from './wrapper';

export class RemoteSession {
	readonly uploading = new Map<string, FileTimes>();
	readonly received = new Map<string, FileTimes>();
	readonly listing = new S3Listing();
	readonly uploadedStats = new Map<string, FileStat>();
	request?: Request;

	constructor(
		readonly target: Target,
		readonly enabled: () => boolean,
	) {}
	clear() {
		this.uploading.clear();
		this.received.clear();
		this.listing.clear();
		this.uploadedStats.clear();
	}
}

export function remoteMiddleware(original: Request, session: RemoteSession): Request {
	const { target } = session;
	const request: Request = async (url, params = {}) => {
		if (!session.enabled()) return original(url, params);
		const method = (params.method ?? 'GET').toUpperCase();
		const parsed = new URL(url);
		const address = canonicalUrl(url);
		let headers = params.headers ?? {};
		let body = params.body;
		const destination = header(headers, 'destination');
		const uploadAddress =
			target.kind === 'webdav' && destination ? canonicalUrl(destination, url) : address;
		const times = session.uploading.get(uploadAddress);
		const isUpload =
			target.kind === 's3'
				? (method === 'PUT' && !parsed.search && !header(headers, 'x-amz-copy-source')) ||
					(method === 'POST' && parsed.searchParams.has('uploads'))
				: method === 'PUT' || (method === 'MOVE' && parsed.pathname.endsWith('/.file'));
		if (times && isUpload && target.contains(uploadAddress)) {
			const extra: Record<string, string> = {};
			if (target.kind === 's3') {
				if (times.mtime !== undefined)
					extra['X-Amz-Meta-Mtime'] = String(times.mtime / 1000);
			} else {
				if (times.mtime !== undefined)
					extra['X-OC-Mtime'] = String(Math.floor(times.mtime / 1000));
				if (times.ctime !== undefined)
					extra['X-OC-Ctime'] = String(Math.floor(times.ctime / 1000));
			}
			headers = setHeaders(headers, extra);
		}
		const propfind = target.kind === 'webdav' && method === 'PROPFIND' && target.contains(url);
		if (propfind && typeof body === 'string') body = requestCreationDate(body);
		let response = await original(url, { ...params, body, headers });
		if (!session.enabled() || response.status < 200 || response.status >= 300) return response;
		if (target.kind === 's3' && target.contains(url))
			if (
				method === 'GET' &&
				parsed.searchParams.get('list-type') === '2' &&
				parsed.searchParams.get('max-keys') !== '0'
			)
				response = session.listing.normalize(response, url);
			else if (method === 'POST' && parsed.searchParams.has('uploads'))
				response = s3MultipartResponse(response);
			else response = s3ObjectResponse(response);

		if (propfind)
			for (const [key, value] of readDavTimes(response.text(), url))
				if (target.contains(key)) session.received.set(key, value);

		return response;
	};
	session.request = request;
	return request;
}

export default class MetadataRemoteFs extends PassthroughFs {
	constructor(
		original: Fs,
		private readonly session: RemoteSession,
	) {
		super(original);
		if (session.target.kind === 's3') {
			// S3 writes can call their own stat() when PUT has no ETag. Intercept
			// The root instance so those calls use the same identity as discovery.
			const root = digOriginal(original);
			const stat = root.stat.bind(root);
			root.stat = (key) =>
				session.enabled() && !key.endsWith('/') ? this.s3Stat(key) : stat(key);
		}
	}

	private async s3Stat(key: string) {
		if (!this.session.request) throw new Error('OpenList S3 request is unavailable.');
		const stat = await s3Stat(this.session.request, this.session.target, key);
		const address = this.session.target.url(key);
		if (this.session.uploading.has(address)) this.session.uploadedStats.set(address, stat);
		return stat;
	}

	private decorate(stat: Stat): Stat {
		if (stat.isDir || !this.session.enabled()) return stat;
		const received = this.session.received.get(this.session.target.url(stat.key));
		return attachTimes(stat, {
			ctime: received?.ctime,
			mtime: received?.mtime ?? stat.mtime,
		});
	}

	async stat(key: string) {
		this.session.received.delete(this.session.target.url(key));
		return this.decorate(await this.original.stat(key));
	}
	async list(key: string, reporter: ListReporter) {
		this.session.received.clear();
		this.session.listing.clear();
		return (await this.original.list(key, reporter)).map((stat) => this.decorate(stat));
	}

	private updateSource(key: string, stat: FileStat) {
		if (!this.session.enabled()) return;
		const cached = getTimes(stat);
		const received = this.session.received.get(this.session.target.url(key));
		attachTimes(stat, {
			ctime:
				this.session.target.kind === 'webdav'
					? (received?.ctime ?? cached?.ctime)
					: undefined,
			mtime:
				this.session.target.kind === 's3'
					? stat.mtime
					: (received?.mtime ?? cached?.mtime ?? stat.mtime),
		});
	}

	async read(key: string, stat: FileStat) {
		const value = await this.original.read(key, stat);
		this.updateSource(key, stat);
		return value;
	}
	readStream(key: string, stat: FileStat) {
		// The listing supplies the standard time before ranged GETs are consumed.
		this.updateSource(key, stat);
		return this.original.readStream(key, stat);
	}

	write(key: string, value: Binary, stat: FileStat) {
		return this.save(key, stat, () => this.original.write(key, value, stat));
	}
	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		return this.save(key, stat, () => this.original.writeStream(key, value, stat));
	}
	private save(key: string, stat: FileStat, action: () => string | Promise<string>) {
		const address = this.session.target.url(key);
		return withTimes(
			this.session.uploading,
			address,
			this.session.enabled() ? (getTimes(stat) ?? {}) : undefined,
			async () => {
				this.session.uploadedStats.delete(address);
				try {
					const uid = await action();
					if (!this.session.enabled() || this.session.target.kind !== 's3') return uid;
					const actual =
						this.session.uploadedStats.get(address) ?? (await this.s3Stat(key));
					return actual.uid;
				} finally {
					this.session.uploadedStats.delete(address);
				}
			},
		);
	}
}
