import type { Binary, FileStat, Fs, ListReporter, Request, Stat } from '@hesprs/sync-engine-sdk';
import { digOriginal } from '@hesprs/sync-engine-sdk';
import type { Target } from './target';
import type { DownloadMeta, FileTimes } from './times';
import { readDavTimes, requestCreationDate } from './dav';
import { s3MultipartResponse, s3Stat } from './s3';
import S3Listing from './s3-listing';
import { canonicalUrl, header, setHeaders } from './target';
import {
	attachDownloadMeta,
	attachTimes,
	cacheMeta,
	getDownloadMeta,
	getTimes,
	isEncryptedTime,
	metadataTime,
	readTimes,
	timeValue,
	withTimes,
} from './times';
import PassthroughFs from './wrapper';

export class RemoteSession {
	readonly uploading = new Map<string, FileTimes>();
	readonly activeS3Writes = new Set<string>();
	readonly uploadedStats = new Map<string, FileStat>();
	readonly downloadedMeta = new Map<string, Dict<string>>();
	readonly received = new Map<string, FileTimes>();
	readonly listing = new S3Listing();
	readonly cleanup: Array<() => void> = [];
	request?: Request;

	constructor(
		readonly target: Target,
		readonly enabled: () => boolean,
		readonly preferMetadataMtime: () => boolean = () => false,
		readonly encryptedMetadata: () => boolean = () => false,
	) {}
	clear() {
		this.uploading.clear();
		this.activeS3Writes.clear();
		this.uploadedStats.clear();
		this.downloadedMeta.clear();
		this.received.clear();
		this.listing.clear();
		this.cleanup.splice(0).forEach((fn) => fn());
	}
	async stat(key: string) {
		if (!this.request) throw new Error('OpenList S3 request is unavailable.');
		const stat = await s3Stat(this.request, this.target, key);
		const address = this.target.url(key);
		if (this.activeS3Writes.has(address)) this.uploadedStats.set(address, stat);
		return stat;
	}
}

export function remoteMiddleware(original: Request, session: RemoteSession): Request {
	const { target } = session;
	const request: Request = async (url, params = {}) => {
		if (!session.enabled()) return original(url, params);

		const method = (params.method ?? 'GET').toUpperCase();
		const parsed = new URL(url);
		let headers = params.headers ?? {};
		let body = params.body;
		const uploadAddress = getUploadAddress(target.kind, parsed, method, headers);
		const times = uploadAddress ? session.uploading.get(uploadAddress) : undefined;
		if (times && uploadAddress && target.contains(uploadAddress))
			headers = setHeaders(headers, getTimeHeaders(target.kind, times));
		const propfind = target.kind === 'webdav' && method === 'PROPFIND' && target.contains(url);
		if (propfind && typeof body === 'string') body = requestCreationDate(body);
		let response = await original(url, { ...params, body, headers });
		if (!session.enabled() || response.status < 200 || response.status >= 300) return response;
		if (target.kind === 's3' && target.contains(url))
			if (method === 'GET' && parsed.searchParams.get('list-type') === '2') {
				if (parsed.searchParams.get('max-keys') !== '0')
					response = session.listing.normalize(response, url);
			} else if (method === 'POST' && parsed.searchParams.has('uploads'))
				response = s3MultipartResponse(response);
			else if (method === 'GET') {
				const meta: Dict<string> = {};
				for (const [name, value] of Object.entries(response.headers)) {
					const lower = name.toLowerCase();
					if (lower.startsWith('x-amz-meta-')) meta[lower.slice(11)] = value;
				}
				// Download metadata enters below encryption, just like native HEAD metadata.
				if (Object.keys(meta).length) session.downloadedMeta.set(canonicalUrl(url), meta);
			}

		if (propfind)
			for (const [address, value] of readDavTimes(response.text(), url))
				if (target.contains(address)) session.received.set(address, value);
		return response;
	};
	session.request = request;
	return request;
}

function getUploadAddress(
	kind: Target['kind'],
	url: URL,
	method: string,
	headers: Record<string, string>,
): string | undefined {
	const address = canonicalUrl(url.href);
	if (kind === 's3') {
		const isObjectUpload =
			method === 'PUT' && !url.search && !header(headers, 'x-amz-copy-source');
		const isMultipartInitiation = method === 'POST' && url.searchParams.has('uploads');
		if (isObjectUpload || isMultipartInitiation) return address;
		return;
	}

	if (method === 'PUT') return address;
	if (method !== 'MOVE') return;

	const destination = header(headers, 'destination');
	const uploadAddress = destination ? canonicalUrl(destination, url.href) : address;
	// Nextcloud completes a chunked upload by moving its assembled .file.
	if (url.pathname.endsWith('/.file')) return uploadAddress;
}

function getTimeHeaders(kind: Target['kind'], times: FileTimes): Record<string, string> {
	const headers: Record<string, string> = {};
	if (kind === 's3') {
		if (times.mtime !== undefined) headers['X-Amz-Meta-Mtime'] = String(times.mtime / 1000);
		return headers;
	}

	if (times.mtime !== undefined) headers['X-OC-Mtime'] = String(Math.floor(times.mtime / 1000));
	if (times.ctime !== undefined) headers['X-OC-Ctime'] = String(Math.floor(times.ctime / 1000));
	return headers;
}

export class UploadRemoteFs extends PassthroughFs {
	private readonly s3: boolean;

	constructor(
		original: Fs,
		private readonly session: RemoteSession,
	) {
		super(original);
		const root = digOriginal(original);
		this.s3 = session.target.kind === 's3' && root.getUid().startsWith('s3~');
		if (this.s3) {
			// The backend's own upload fallback must use the same identity as list().
			const originalStat = root.stat;
			const stat: Fs['stat'] = (key) =>
				session.enabled() && !key.endsWith('/')
					? session.stat(key)
					: originalStat.call(root, key);
			root.stat = stat;
			session.cleanup.push(() => {
				if (root.stat === stat) root.stat = originalStat;
			});
		}
	}

	private decorate(stat: Stat): Stat {
		if (stat.isDir || !this.session.enabled()) return stat;
		const address = this.session.target.url(stat.key);
		const getMeta = cacheMeta(stat.meta);
		const downloadMeta: DownloadMeta = { get: () => this.session.downloadedMeta.get(address) };
		const source = {
			...stat,
			meta: async () => {
				if (!this.session.enabled()) return stat.meta();
				const downloaded = downloadMeta.get();
				const meta = downloaded ?? (await getMeta());
				if (this.session.target.kind !== 's3') return meta;
				// Plaintext S3 time headers use seconds and bypass metadata decryption.
				downloadMeta.mtime = metadataTime(meta.mtime, 'seconds');
				const result = { ...meta };
				if (
					!this.session.preferMetadataMtime() ||
					!this.session.encryptedMetadata() ||
					downloadMeta.mtime !== undefined ||
					!isEncryptedTime(meta.mtime)
				)
					delete result.mtime;
				return result;
			},
		};
		const received = this.session.received.get(address);
		const decorated = attachDownloadMeta(source, downloadMeta);
		return received ? attachTimes(decorated, received) : decorated;
	}

	async stat(key: string) {
		this.session.received.delete(this.session.target.url(key));
		this.session.downloadedMeta.delete(this.session.target.url(key));
		return this.decorate(await this.original.stat(key));
	}
	async list(key: string, reporter: ListReporter) {
		this.session.received.clear();
		this.session.downloadedMeta.clear();
		this.session.listing.clear();
		return (await this.original.list(key, reporter)).map((stat) => this.decorate(stat));
	}
	read(key: string, stat: FileStat) {
		this.prepareDownload(key, stat);
		return this.original.read(key, stat);
	}
	readStream(key: string, stat: FileStat) {
		this.prepareDownload(key, stat);
		return this.original.readStream(key, stat);
	}
	private prepareDownload(key: string, stat: FileStat) {
		const address = this.session.target.url(key);
		this.session.downloadedMeta.delete(address);
		const metadata = getDownloadMeta(stat);
		// Context caches can supply a stat created by a previous sync session.
		if (metadata) metadata.get = () => this.session.downloadedMeta.get(address);
	}

	write(key: string, value: Binary, stat: FileStat) {
		return this.save(key, stat, () => this.original.write(key, value, stat));
	}
	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		return this.save(key, stat, () => this.original.writeStream(key, value, stat));
	}
	private async save(key: string, stat: FileStat, action: () => string | Promise<string>) {
		const times = getTimes(stat);
		if (!this.session.enabled()) return action();
		const address = this.session.target.url(key);
		const upload = () =>
			times ? withTimes(this.session.uploading, address, times, action) : action();
		if (!this.s3) return upload();
		if (this.session.activeS3Writes.has(address))
			throw new Error(`Concurrent writes to the same file: ${address}`);
		this.session.activeS3Writes.add(address);
		this.session.uploadedStats.delete(address);
		this.session.downloadedMeta.delete(address);
		try {
			const uid = await upload();
			if (!this.session.enabled()) return uid;
			const actual =
				this.session.uploadedStats.get(address) ?? (await this.session.stat(key));
			return actual.uid;
		} finally {
			this.session.activeS3Writes.delete(address);
			this.session.uploadedStats.delete(address);
		}
	}
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
		return {
			...stat,
			meta: async () => {
				const meta = await stat.meta();
				if (!this.session.enabled()) return meta;
				const result = { ...meta };
				delete result.mtime;
				const ctime = readTimes(meta).ctime ?? getTimes(stat)?.ctime;
				if (ctime === undefined) delete result.ctime;
				else result.ctime = String(ctime);
				const preferred = this.session.preferMetadataMtime()
					? (metadataTime(meta.mtime, 'milliseconds') ?? getDownloadMeta(stat)?.mtime)
					: undefined;
				const mtime = preferred ?? timeValue(stat.mtime);
				if (mtime !== undefined) result.mtime = String(mtime);
				return result;
			},
		};
	}

	async stat(key: string) {
		return this.decorate(await this.original.stat(key));
	}
	async list(key: string, reporter: ListReporter) {
		return (await this.original.list(key, reporter)).map((stat) => this.decorate(stat));
	}

	write(key: string, value: Binary, stat: FileStat) {
		return this.save(key, stat, (source) => this.original.write(key, value, source));
	}
	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		return this.save(key, stat, (source) => this.original.writeStream(key, value, source));
	}
	private async save(
		key: string,
		stat: FileStat,
		action: (source: FileStat) => string | Promise<string>,
	) {
		if (!this.session.enabled()) return action(stat);
		const meta = await stat.meta();
		if (!this.session.enabled()) return action(stat);
		// Mtime uses OpenList's plaintext time header; ctime remains native metadata.
		const times = readTimes(meta);
		const remaining = { ...meta };
		if (times.ctime === undefined) delete remaining.ctime;
		delete remaining.mtime;
		return action(attachTimes({ ...stat, meta: () => remaining }, times));
	}
}
