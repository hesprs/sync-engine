import type {
	FileStat,
	FolderStat,
	Fs,
	ListReporter,
	Request,
	Stat,
} from '@hesprs/sync-engine-sdk';
import { digOriginal } from '@hesprs/sync-engine-sdk';
import type { Target } from './target';
import type { DownloadMeta, FileTimes } from './times';
import type { SaveFile } from './wrapper';
import { extractMeta, s3Meta, s3MultipartResponse, s3Stat } from './s3';
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
} from './times';
import MetadataFs from './wrapper';

type Upload = FileTimes & { stat?: FileStat };

export class RemoteSession {
	readonly encryptedMetadata: () => boolean;
	readonly fastMode: () => boolean;
	readonly uploads = new Map<string, Upload>();
	readonly downloadedMeta = new Map<string, Dict<string>>();
	readonly listing = new S3Listing();
	readonly cleanup: Array<() => void> = [];
	request?: Request;

	constructor(
		readonly target: Target,
		readonly enabled: () => boolean,
		readonly preferMetadataMtime: () => boolean = () => false,
		options: { encryptedMetadata?: () => boolean; fastMode?: () => boolean } = {},
	) {
		this.encryptedMetadata = options.encryptedMetadata ?? (() => false);
		this.fastMode = options.fastMode ?? (() => false);
	}
	clear() {
		this.uploads.clear();
		this.downloadedMeta.clear();
		this.listing.clear();
		this.cleanup.splice(0).forEach((fn) => fn());
	}
	async stat(key: string) {
		if (!this.request) throw new Error('S3 rclone request is unavailable.');
		const stat = await s3Stat(this.request, this.target, key, this.fastMode());
		const upload = this.uploads.get(this.target.url(key));
		if (upload) upload.stat = stat;
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
		const uploadAddress = getUploadAddress(parsed, method, headers);
		const times = uploadAddress ? session.uploads.get(uploadAddress) : undefined;
		if (times && uploadAddress && target.contains(uploadAddress))
			headers = setHeaders(headers, getTimeHeaders(times));
		let response = await original(url, { ...params, headers });
		if (!session.enabled() || response.status < 200 || response.status >= 300) return response;
		if (target.contains(url))
			if (method === 'GET' && parsed.searchParams.get('list-type') === '2') {
				if (parsed.searchParams.get('max-keys') !== '0')
					response = session.listing.normalize(response, url);
			} else if (method === 'POST' && parsed.searchParams.has('uploads'))
				response = s3MultipartResponse(response);
			else if (method === 'GET') {
				const meta = extractMeta(response.headers);
				// Download metadata enters below encryption, just like native HEAD metadata.
				if (Object.keys(meta).length) session.downloadedMeta.set(canonicalUrl(url), meta);
			}

		return response;
	};
	session.request = request;
	return request;
}

function getUploadAddress(
	url: URL,
	method: string,
	headers: Record<string, string>,
): string | undefined {
	const isObjectUpload = method === 'PUT' && !url.search && !header(headers, 'x-amz-copy-source');
	const isMultipartInitiation = method === 'POST' && url.searchParams.has('uploads');
	if (isObjectUpload || isMultipartInitiation) return canonicalUrl(url.href);
}

function getTimeHeaders(times: FileTimes): Record<string, string> {
	return times.mtime === undefined ? {} : { 'X-Amz-Meta-Mtime': String(times.mtime / 1000) };
}

export class UploadRemoteFs extends MetadataFs {
	private readonly s3: boolean;

	constructor(
		original: Fs,
		private readonly session: RemoteSession,
	) {
		super(original);
		const root = digOriginal(original);
		this.s3 = root.getUid().startsWith('s3~');
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

	protected decorate(stat: Stat): Stat {
		if (stat.isDir || !this.session.enabled()) return stat;
		const address = this.session.target.url(stat.key);
		const downloadMeta: DownloadMeta = {
			address,
			fallback: cacheMeta(stat.meta),
			get: () => this.session.downloadedMeta.get(address),
			owner: this.session,
		};
		const source = {
			...stat,
			meta: async () => {
				if (!this.session.enabled()) return stat.meta();
				const downloaded = downloadMeta.get();
				const meta = downloaded ?? (await downloadMeta.fallback());
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
		return attachDownloadMeta(source, downloadMeta);
	}

	async stat(key: string) {
		this.session.downloadedMeta.delete(this.session.target.url(key));
		return super.stat(key);
	}
	async list(key: string, reporter: ListReporter) {
		this.session.downloadedMeta.clear();
		this.session.listing.clear();
		try {
			return await super.list(key, reporter);
		} finally {
			this.session.listing.clear();
		}
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
		if (!metadata) return;
		// Cached stats can outlive a cancelled session or move to another key.
		if (metadata.owner !== this.session || metadata.address !== address) {
			metadata.owner = this.session;
			metadata.address = address;
			metadata.fallback = cacheMeta(() =>
				s3Meta(this.session.request, this.session.target, key),
			);
			metadata.mtime = undefined;
		}
		metadata.get = () => this.session.downloadedMeta.get(address);
	}

	mkdir(key: string, stat: FolderStat, recursive?: boolean) {
		// S3 file uploads establish their parent paths without directory markers.
		if (!this.s3 || !this.session.enabled()) return this.original.mkdir(key, stat, recursive);
	}
	protected async save(key: string, stat: FileStat, action: SaveFile) {
		if (!this.session.enabled()) return action(stat);
		const address = this.session.target.url(key);
		if (this.session.uploads.has(address))
			throw new Error(`Concurrent writes to the same file: ${address}`);
		const upload: Upload = { ...getTimes(stat) };
		this.session.uploads.set(address, upload);
		this.session.downloadedMeta.delete(address);
		try {
			const uid = await action(stat);
			return this.s3 && this.session.enabled()
				? (upload.stat ?? (await this.session.stat(key))).uid
				: uid;
		} finally {
			this.session.uploads.delete(address);
		}
	}
}

export default class MetadataRemoteFs extends MetadataFs {
	constructor(
		original: Fs,
		private readonly session: RemoteSession,
	) {
		super(original);
	}

	protected decorate(stat: Stat): Stat {
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

	protected async save(_key: string, stat: FileStat, action: SaveFile) {
		if (!this.session.enabled()) return action(stat);
		const meta = await stat.meta();
		if (!this.session.enabled()) return action(stat);
		// Mtime uses rclone's plaintext time header; ctime remains native metadata.
		const times = readTimes(meta);
		const remaining = { ...meta };
		if (times.ctime === undefined) delete remaining.ctime;
		delete remaining.mtime;
		return action(attachTimes({ ...stat, meta: () => remaining }, times));
	}
}
