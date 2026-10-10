import type {
	Binary,
	FileStat,
	FolderStat,
	ListReporter,
	Request,
	RequestParam,
	RequestResponse,
	RootFs,
	Stat,
} from '@hesprs/sync-engine-sdk';
import { chunkSize, concurrency } from '@hesprs/sync-engine-sdk';
import { concatBinary, textToUint8Array } from '@repo/shared/binary';
import { getStatus, toError } from '@repo/shared/error';
import parseXML from '@repo/shared/parse-xml';
import { dirname, encodeUrl, isFolder } from '@repo/shared/path';
import createRangeReadStream from '@repo/shared/read-stream';
import type { UrlStyle } from './sigv4';
import { PART_SIZE, multipartUpload } from './multipart';
import { md5Base64 } from './sigv4';
import { buildUrl, buildUrlWithQuery, getHeader } from './url';
import {
	formatS3Error,
	getFileUid,
	getObjectEtag,
	extractMetaHeaders,
	parseS3Error,
	toMetaHeaders,
} from './utils';

export type S3FsOptions = {
	accessKeyId: string;
	endpoint: string;
	region: string;
	bucket: string;
	urlStyle: UrlStyle;
	request: Request;
	fetchObjectMeta: boolean;
};

const BATCH_DELETE_MAX_KEYS = 1000;

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
	ETag?: unknown;
	LastModified?: string;
};

const mtimeMissing = new Error('S3 did not return last modified time for objects!');
const sizeMissing = new Error('S3 did not return size for objects!');

function buildDeleteObjectsXml(keys: Array<string>): string {
	const objects = keys.map((key) => `<Object><Key>${escapeXml(key)}</Key></Object>`).join('');
	return `<Delete xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Quiet>true</Quiet>${objects}</Delete>`;
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

function parseBatchDelete(xml: string): Record<string, Error> {
	if (!xml.trim()) return {};
	const result: Record<string, Error> = {};
	const errors = asArray(parseXML<S3DeleteResponse>(xml).DeleteResult?.Error);
	for (const { Key, Code, Message } of errors)
		if (Key && Code) result[Key] = new Error(formatS3Error(Code, Message));
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
	private readonly endpoint: string;
	private readonly bucket: string;
	private readonly urlStyle: UrlStyle;

	constructor(private readonly options: S3FsOptions) {
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
		const response = await this.options.request(url, { ...params, throw: false });
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

	async write(key: string, value: Binary, stat: FileStat): Promise<string> {
		const headers = {
			'Content-Type': 'application/octet-stream',
			...toMetaHeaders(await stat.meta()),
		};
		const response = await this.requestOrThrow(this.buildUrl(key), {
			body: value,
			headers,
			method: 'PUT',
		});
		const etag = getObjectEtag(getHeader(response.headers, 'etag'));
		return etag ?? getFileUid(await this.stat(key), key);
	}

	async writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat): Promise<string> {
		if (stat.size < PART_SIZE) return this.write(key, await collectStreamToBinary(value), stat);
		return multipartUpload(
			{
				bucket: this.bucket,
				endpoint: this.endpoint,
				key,
				meta: await stat.meta(),
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
	async batchDelete(keys: Array<string>): Promise<Record<string, Error>> {
		const result: Record<string, Error> = {};
		const batches: Array<Array<string>> = [];
		for (let i = 0; i < keys.length; i += BATCH_DELETE_MAX_KEYS)
			batches.push(keys.slice(i, i + BATCH_DELETE_MAX_KEYS));
		await Promise.all(
			batches.map(async (batch) => {
				const body = buildDeleteObjectsXml(batch);
				const url = buildUrlWithQuery(
					{
						bucket: this.bucket,
						endpoint: this.endpoint,
						key: '/',
						urlStyle: this.urlStyle,
					},
					{ delete: '' },
				);
				let response: RequestResponse;
				try {
					response = await this.requestOrThrow(url, {
						body: textToUint8Array(body),
						headers: {
							'Content-MD5': await md5Base64(body),
							'Content-Type': 'application/xml',
						},
						method: 'POST',
					});
				} catch {
					await Promise.all(
						batch.map(async (key) =>
							this.delete(key).catch(
								(error: unknown) => (result[key] = toError(error)),
							),
						),
					);
					return;
				}
				Object.assign(result, parseBatchDelete(response.text()));
			}),
		);
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

	async mkdir(key: string, { meta }: FolderStat, recursive?: boolean): Promise<void> {
		const dirKeys = recursive ? getRecursiveKeys(key) : [key];
		await Promise.all(
			dirKeys.map(async (dirKey) => {
				const headers = { 'Content-Type': 'application/octet-stream' };
				if (dirKey === key) Object.assign(headers, toMetaHeaders(await meta()));
				return this.requestOrThrow(this.buildUrl(dirKey), {
					body: new Uint8Array(0),
					headers,
					method: 'PUT',
				});
			}),
		);
	}

	private async fetchMeta(key: string): Promise<Record<string, string>> {
		const { headers } = await this.requestOrThrow(this.buildUrl(key), { method: 'HEAD' });
		return extractMetaHeaders(headers);
	}

	async stat(key: string): Promise<Stat> {
		if (isFolder(key)) return { isDir: true, key, meta: () => this.fetchMeta(key) };
		const { headers } = await this.requestOrThrow(this.buildUrl(key), { method: 'HEAD' });
		const etag = getObjectEtag(getHeader(headers, 'etag'));
		const contentLength = getHeader(headers, 'content-length');
		const lastModified = getHeader(headers, 'last-modified');
		if (!lastModified) throw mtimeMissing;
		if (!contentLength) throw sizeMissing;
		const mtime = new Date(lastModified).valueOf();
		const size = Number.parseInt(contentLength);
		return {
			isDir: false,
			key,
			meta: () => extractMetaHeaders(headers),
			mtime,
			size,
			uid: etag ?? `${mtime}~${size}`,
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
					const meta = this.options.fetchObjectMeta
						? () => this.fetchMeta(Key)
						: () => ({});
					if (isFolder(Key)) results.push({ isDir: true, key: Key, meta });
					else {
						if (!LastModified) throw mtimeMissing;
						if (!Size) throw sizeMissing;
						const mtime = new Date(LastModified).valueOf();
						const size = Number.parseInt(Size);
						results.push({
							isDir: false,
							key: Key,
							meta,
							mtime,
							size,
							uid: getObjectEtag(ETag) ?? `${mtime}~${size}`,
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
