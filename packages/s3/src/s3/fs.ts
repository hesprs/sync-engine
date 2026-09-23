import type {
	Binary,
	FileStat,
	ListReporter,
	Request,
	RequestParam,
	RequestResponse,
	RootFs,
	Stat,
} from '@hesprs/sync-engine-sdk';
import { chunkSize, concurrency } from '@hesprs/sync-engine-sdk';
import { concatBinary, textToUint8Array } from '@repo/shared/binary';
import { getStatus } from '@repo/shared/error';
import normalizeEtag from '@repo/shared/normalize-etag';
import parseXML from '@repo/shared/parse-xml';
import { dirname, encodeUrl, isFolder } from '@repo/shared/path';
import createRangeReadStream from '@repo/shared/read-stream';
import type { UrlStyle } from './sigv4';
import { PART_SIZE, multipartUpload } from './multipart';
import { md5Base64 } from './sigv4';
import { buildUrl, buildUrlWithQuery, getHeader } from './url';
import { formatS3Error, getFileUid, parseS3Error } from './utils';

export type S3FsOptions = {
	accessKeyId: string;
	endpoint: string;
	region: string;
	bucket: string;
	urlStyle: UrlStyle;
	request: Request;
};

export const BATCH_DELETE_MAX_KEYS = 1000;

type S3ListBucketResult = {
	ListBucketResult: {
		Contents?: S3Object | Array<S3Object>;
		IsTruncated?: string;
		NextContinuationToken?: string;
	};
};

type S3DeleteError = {
	Key?: string;
	Code?: string;
	Message?: string;
};

type S3DeleteResponse = {
	DeleteResult?: {
		Error?: S3DeleteError | Array<S3DeleteError>;
	};
};

type S3Object = {
	Key?: string;
	Size?: string;
	ETag?: string;
	LastModified?: string;
};

const mtimeMissing = new Error('S3 did not return last modified time for objects!');
const sizeMissing = new Error('S3 did not return size for objects!');

function buildDeleteObjectsXml(keys: Array<string>): string {
	const objects = keys.map((key) => `<Object><Key>${escapeXml(key)}</Key></Object>`).join('');
	return `<?xml version="1.0" encoding="UTF-8"?><Delete xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Quiet>true</Quiet>${objects}</Delete>`;
}

function escapeXml(str: string): string {
	return str
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function asArray<T>(value: T | Array<T> | undefined): Array<T> {
	return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function parseBatchDeleteResponse(xml: string, keys: Array<string>): Record<string, true | string> {
	const result = Object.fromEntries(keys.map((key) => [key, true])) as Record<
		string,
		true | string
	>;
	if (!xml.trim()) return result;
	const errors = asArray(parseXML<S3DeleteResponse>(xml).DeleteResult?.Error);
	for (const error of errors)
		if (error.Key && error.Code) result[error.Key] = formatS3Error(error.Code, error.Message);
	return result;
}

function getRecursiveKeys(key: string): Array<string> {
	const keys: Array<string> = [];
	while (key !== '/') {
		keys.push(key);
		key = dirname(key);
	}
	return keys.reverse();
}

export default class S3Fs implements RootFs {
	private readonly request: Request;
	private readonly endpoint: string;
	private readonly bucket: string;
	private readonly urlStyle: UrlStyle;

	constructor(private readonly options: S3FsOptions) {
		if (!options.request) throw new Error('S3 request is required.');
		this.request = options.request;
		this.endpoint = options.endpoint;
		this.bucket = options.bucket;
		this.urlStyle = options.urlStyle;
	}

	getUid(): string {
		return `s3~${this.endpoint}~${this.bucket}~${this.options.accessKeyId}`;
	}

	private buildUrl(key: string) {
		return buildUrl({
			bucket: this.bucket,
			endpoint: this.endpoint,
			key,
			urlStyle: this.urlStyle,
		});
	}

	private readonly requestOrThrow = async (
		url: string,
		params: RequestParam = {},
	): Promise<RequestResponse> => {
		const response = await this.request(url, { ...params, throw: false });
		if (response.status >= 200 && response.status < 300) return response;

		const body = response.text();
		const s3Error = parseS3Error(body);
		const error = new Error(
			s3Error ?? `S3 request failed: ${response.status} ${params.method} ${url}`,
		);
		(error as { status?: number }).status = response.status;
		throw error;
	};

	async read(key: string): Promise<Binary> {
		const response = await this.requestOrThrow(this.buildUrl(key), { method: 'GET' });
		return response.bytes();
	}

	readStream(key: string, { size }: FileStat) {
		const url = this.buildUrl(key);
		return createRangeReadStream({
			chunkSize,
			concurrency,
			requestRange: async (start, endInclusive) => {
				const response = await this.requestOrThrow(url, {
					headers: { Range: `bytes=${start}-${endInclusive}` },
					method: 'GET',
				});
				return response.bytes();
			},
			size,
		});
	}

	async write(key: string, value: Binary): Promise<string> {
		const response = await this.requestOrThrow(this.buildUrl(key), {
			body: value,
			headers: { 'Content-Type': 'application/octet-stream' },
			method: 'PUT',
		});
		const etag = getHeader(response.headers, 'etag');
		return etag ? normalizeEtag(etag) : getFileUid(await this.stat(key), key);
	}

	async writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat): Promise<string> {
		if (stat.size < PART_SIZE) return this.write(key, await collectStreamToBinary(value));
		return multipartUpload(
			{
				bucket: this.bucket,
				endpoint: this.endpoint,
				key,
				request: this.requestOrThrow,
				stat: (k) => this.stat(k),
				urlStyle: this.urlStyle,
			},
			value,
		);
	}

	async delete(key: string): Promise<void> {
		try {
			await this.requestOrThrow(this.buildUrl(key), { method: 'DELETE' });
		} catch (error) {
			if (getStatus(error) === 404) return;
			throw error;
		}
	}

	/**
	 * Batch delete — S3-specific extension method accessed by the optimizer.
	 * Up to 1000 keys per DeleteObjects request.
	 */
	async batchDelete(keys: Array<string>): Promise<Record<string, true | string>> {
		const result: Record<string, true | string> = {};
		for (let i = 0; i < keys.length; i += BATCH_DELETE_MAX_KEYS) {
			const batch = keys.slice(i, i + BATCH_DELETE_MAX_KEYS);
			const body = buildDeleteObjectsXml(batch);
			const url = buildUrlWithQuery(
				{ bucket: this.bucket, endpoint: this.endpoint, key: '/', urlStyle: this.urlStyle },
				{ delete: '' },
			);
			const response = await this.requestOrThrow(url, {
				body: textToUint8Array(body),
				headers: {
					'Content-MD5': await md5Base64(body),
					'Content-Type': 'application/xml',
				},
				method: 'POST',
			});
			Object.assign(result, parseBatchDeleteResponse(response.text(), batch));
		}
		return result;
	}

	async move(oldKey: string, newKey: string): Promise<void> {
		// S3 has no native rename — copy then delete
		const copySource = `${this.bucket}/${encodeUrl(oldKey)}`;
		const destUrl = this.buildUrl(newKey);
		await this.requestOrThrow(destUrl, {
			headers: {
				'Content-Type': 'application/octet-stream',
				'x-amz-copy-source': copySource,
			},
			method: 'PUT',
		});
		await this.delete(oldKey);
	}

	async mkdir(key: string, recursive = false): Promise<void> {
		const dirKeys = recursive ? getRecursiveKeys(key) : [key];
		for (const dirKey of dirKeys) {
			// S3 has no real folders — create a 0-byte placeholder object
			const url = this.buildUrl(dirKey);
			try {
				await this.requestOrThrow(url, {
					body: new Uint8Array(0),
					headers: { 'Content-Type': 'application/octet-stream' },
					method: 'PUT',
				});
			} catch (error) {
				if (getStatus(error) === 409) continue;
				throw error;
			}
		}
	}

	async stat(key: string): Promise<Stat> {
		if (isFolder(key)) return { isDir: true, key };
		const response = await this.requestOrThrow(this.buildUrl(key), { method: 'HEAD' });
		const etag = getHeader(response.headers, 'etag');
		const contentLength = getHeader(response.headers, 'content-length');
		const lastModified = getHeader(response.headers, 'last-modified');
		if (!lastModified) throw mtimeMissing;
		if (!contentLength) throw sizeMissing;
		const mtime = new Date(lastModified).valueOf();
		const size = Number.parseInt(contentLength);
		return {
			isDir: false,
			key,
			mtime,
			size,
			uid: etag ? normalizeEtag(etag) : `${mtime}~${size}`,
		};
	}

	async exists(key: string): Promise<boolean> {
		if (key === '/') return true;
		try {
			await this.stat(key);
			return true;
		} catch (error) {
			if (getStatus(error) === 404) return false;
			throw error;
		}
	}

	async list(key: string, reporter: ListReporter): Promise<Array<Stat>> {
		const results: Array<Stat> = [];
		let continuationToken: string | undefined;
		do {
			const query: Record<string, string> = {
				'list-type': '2',
				prefix: key === '/' ? '' : key,
			};
			if (continuationToken) query['continuation-token'] = continuationToken;
			const url = buildUrlWithQuery(
				{ bucket: this.bucket, endpoint: this.endpoint, key: '/', urlStyle: this.urlStyle },
				query,
			);
			const response = await this.requestOrThrow(url, { method: 'GET' });
			const { ListBucketResult: listing } = parseXML<S3ListBucketResult>(response.text());
			const contents = asArray(listing.Contents);
			await Promise.all(
				contents.map(async ({ Key, ETag, LastModified, Size }, index) => {
					if (
						!Key ||
						Key === key ||
						(await reporter({
							completed: index + 1,
							current: Key,
							total: contents.length,
						})) === 'exclude'
					)
						return;
					if (isFolder(Key)) results.push({ isDir: true, key: Key });
					else {
						if (!LastModified) throw mtimeMissing;
						if (!Size) throw sizeMissing;
						const mtime = new Date(LastModified).valueOf();
						const size = Number.parseInt(Size);
						results.push({
							isDir: false,
							key: Key,
							mtime,
							size,
							uid: ETag ? normalizeEtag(ETag) : `${mtime}~${size}`,
						});
					}
				}),
			);
			continuationToken =
				listing.IsTruncated === 'true' ? listing.NextContinuationToken : undefined;
		} while (continuationToken);

		return results;
	}
}

async function collectStreamToBinary(source: ReadableStream<Binary>): Promise<Binary> {
	const reader = source.getReader();
	const chunks: Array<Binary> = [];
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}
		return concatBinary(...chunks);
	} finally {
		reader.releaseLock();
	}
}
