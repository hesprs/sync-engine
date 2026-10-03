import type { Binary, FileStat, Fs, ListReporter, Request, Stat } from '@hesprs/sync-engine-sdk';
import type { Target } from './target';
import type { FileTimes } from './times';
import { readDavTimes, requestCreationDate } from './dav';
import S3DirectoryListing from './directories';
import { s3ListResponse, s3MultipartResponse, s3ObjectResponse, s3Times } from './s3';
import { canonicalUrl, header, setHeaders } from './target';
import { attachTimes, getTimes, withTimes } from './times';
import PassthroughFs from './wrapper';

export class RemoteSession {
	readonly uploading = new Map<string, FileTimes>();
	readonly received = new Map<string, FileTimes>();
	readonly directories = new S3DirectoryListing();
	request?: Request;

	constructor(
		readonly target: Target,
		readonly enabled: () => boolean,
	) {}
	clear() {
		this.uploading.clear();
		this.received.clear();
		this.directories.clear();
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
			) {
				response = await s3ListResponse({
					received: session.received,
					request: original,
					response,
					target,
				});
				if (!parsed.searchParams.has('delimiter'))
					response = await session.directories.restore(response, url, original, target);
			} else if (method === 'POST' && parsed.searchParams.has('uploads'))
				response = s3MultipartResponse(response);
			else {
				if (!parsed.search && (method === 'GET' || method === 'HEAD'))
					session.received.set(address, s3Times(response.headers));
				response = s3ObjectResponse(response);
			}

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
		this.session.directories.clear();
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
			mtime: received?.mtime ?? cached?.mtime ?? stat.mtime,
		});
	}

	async read(key: string, stat: FileStat) {
		const value = await this.original.read(key, stat);
		this.updateSource(key, stat);
		return value;
	}
	async readStream(key: string, stat: FileStat) {
		// Ranged GET responses arrive after the stream is returned.
		// Resolve times before the local writer starts.
		if (this.session.enabled() && this.session.target.kind === 's3')
			await this.session.request?.(this.session.target.url(key), {
				method: 'HEAD',
				throw: false,
			});
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
		return withTimes(
			this.session.uploading,
			this.session.target.url(key),
			this.session.enabled() ? getTimes(stat) : undefined,
			async () => {
				const uid = await action();
				if (!this.session.enabled() || this.session.target.kind !== 's3') return uid;
				// OpenList PUT can return an ETag that its later HEAD/list omits.
				// Record the durable identity so the next sync does not re-download.
				const actual = await this.original.stat(key);
				if (actual.isDir) throw new Error(`Expected uploaded file: ${key}`);
				return actual.uid;
			},
		);
	}
}
