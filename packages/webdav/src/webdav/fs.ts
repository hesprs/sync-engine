import type {
	Binary,
	FileStat,
	FolderStat,
	ListReporter,
	MaybePromise,
	Request,
	RequestParam,
	RequestResponse,
	RootFs,
	Stat,
} from '@hesprs/sync-engine-sdk';
import { chunkSize, concurrency } from '@hesprs/sync-engine-sdk';
import { concatBinary } from '@repo/shared/binary';
import { getStatus } from '@repo/shared/error';
import parseXML from '@repo/shared/parse-xml';
import {
	dirname,
	normalizeChar,
	normalizeKey,
	normalizeUrl,
	stripEndSlash,
} from '@repo/shared/path';
import createRangeReadStream from '@repo/shared/read-stream';
import writeNextcloudChunkedUpload from './chunked-upload';
import { buildUrl, getFileUid, getHeader, getObjectEtag, parseWebDAVError } from './utils';

export type WebdavFsOptions = {
	endpoint: string;
	username: string;
	request: Request;
	chunkedUpload: boolean;
	depthInfinity: boolean;
	fileMetadata: boolean;
};

const WEBDAV_PAGE = 'https://sync.consensia.cc/deep-dive/modules/webdav';

type WebDAVPropValue = string | { '#text'?: string } | undefined;

type WebDAVProp = {
	displayname?: WebDAVPropValue;
	getcontentlength?: WebDAVPropValue;
	getetag?: WebDAVPropValue;
	getlastmodified?: WebDAVPropValue;
	resourcetype?: { collection?: unknown } | string;
	'se:meta'?: WebDAVPropValue;
	meta?: WebDAVPropValue;
};

type WebDAVPropstat = {
	prop?: WebDAVProp;
	status?: string;
};

type WebDAVResponseItem = {
	href: string;
	propstat?: WebDAVPropstat | Array<WebDAVPropstat>;
};

type WebDAVMultistatus = {
	multistatus: { response: WebDAVResponseItem | Array<WebDAVResponseItem> };
};

function getDavText(value: WebDAVPropValue) {
	if (typeof value === 'string') return value;
	if (!value || typeof value !== 'object') return;
	const text = value['#text'];
	if (typeof text === 'string') return text;
}

function isCollectionResource(resourcetype: WebDAVProp['resourcetype']) {
	if (!resourcetype) return false;
	if (typeof resourcetype === 'string') return resourcetype.toLowerCase() === 'collection';
	return 'collection' in resourcetype;
}

function isSuccessStatus(status: string | undefined) {
	if (!status) return true;
	const match = /\s(?<code>\d{3})(?:\s|$)/u.exec(status);
	if (!match) return false;
	const code = Number.parseInt(match.groups?.code ?? '', 10);
	return code >= 200 && code < 300;
}

function asArray<T>(value: T | Array<T>) {
	return Array.isArray(value) ? value : [value];
}

function getRecursiveKeys(key: string) {
	const keys: Array<string> = [];
	while (key !== '/') {
		keys.push(key);
		key = dirname(key);
	}
	return keys.reverse();
}

function stripEndpoint(endpoint: string, href: string) {
	if (href.startsWith(endpoint)) href = href.slice(endpoint.length);
	else {
		const pathname = new URL(endpoint).pathname;
		if (pathname !== '/' && href.startsWith(pathname)) href = href.slice(pathname.length);
	}
	return href.slice(1);
}

function toKey(href: string, endpoint: string, isDir: boolean) {
	const stripped = stripEndpoint(endpoint, href);
	if (!stripped) return '/';
	return normalizeKey(normalizeChar(stripped), isDir);
}

function extractNextLink(linkHeader: string): string | undefined {
	const matches = /<(?<href>[^>]+)>;\s*rel="next"/u.exec(linkHeader);
	return matches?.groups?.href;
}

function isTargetItem(key: string, endpoint: string, item: WebDAVResponseItem) {
	return normalizeChar(stripEndSlash(stripEndpoint(endpoint, item.href))) === stripEndSlash(key);
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

export default class WebdavFs implements RootFs {
	private readonly endpoint: string;
	private readonly propfindBody: string;

	constructor(private readonly options: WebdavFsOptions) {
		const { endpoint, fileMetadata } = options;
		this.endpoint = normalizeUrl(endpoint);
		// WebDAV servers who support both headers all support creationdate in PROPFIND
		this.propfindBody = `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:"${fileMetadata ? ` xmlns:se="${WEBDAV_PAGE}"` : ''}>
  <prop>
    <displayname/>
    <resourcetype/>
    <getlastmodified/>
    <getcontentlength/>
    <getetag/>${fileMetadata ? '\n    <se:meta/>' : ''}
  </prop>
</propfind>`;
	}

	private async resolveMeta(
		getMeta: () => MaybePromise<Dict<string>>,
	): Promise<Dict<string> | undefined> {
		if (!this.options.fileMetadata) return;
		const meta = await getMeta();
		if (Object.keys(meta).length) return meta;
	}

	private async propfind(
		params: ({ key: string } | { url: string }) & { depth?: '0' | '1' | 'infinity' },
	) {
		const depth = params.depth ?? '0';
		const url = 'url' in params ? params.url : buildUrl(this.endpoint, params.key);
		const response = await this.requestOrThrow(url, {
			body: this.propfindBody,
			contentType: 'application/xml',
			headers: { Depth: depth },
			method: 'PROPFIND',
		});
		const parsed = parseXML<WebDAVMultistatus>(response.text());
		const items = asArray(parsed.multistatus.response);

		// Handle pagination
		const linkHeader = response.headers.link || response.headers.Link;
		if (!linkHeader) return items;
		const nextLink = extractNextLink(linkHeader);
		if (!nextLink) return items;
		items.push(...(await this.propfind({ depth, url: new URL(nextLink).toString() })));
		return items;
	}

	private toStat({ propstat, href }: WebDAVResponseItem): Stat | undefined {
		const propstats = propstat ? asArray(propstat) : [];
		const validPropstat = propstats.find(({ status, prop }) => isSuccessStatus(status) && prop);
		if (!validPropstat?.prop) return;
		const {
			resourcetype,
			getcontentlength,
			getetag,
			getlastmodified,
			'se:meta': prefixedMeta,
			meta: localMeta,
		} = validPropstat.prop;
		// The shared XML parser uses localName and removes namespace prefixes.
		const seMeta = prefixedMeta ?? localMeta;
		const isDir = isCollectionResource(resourcetype);
		const key = toKey(href, this.endpoint, isDir);
		const meta = () => {
			if (this.options.fileMetadata) {
				const metaJson = getDavText(seMeta);
				if (metaJson) return JSON.parse(metaJson) as Dict<string>;
			}
			return {};
		};
		if (isDir) return { isDir: true, key, meta };
		const mtime = new Date(getDavText(getlastmodified) ?? '0').valueOf();
		const size = Number.parseInt(getDavText(getcontentlength) ?? '0', 10);
		const etag = getObjectEtag(getDavText(getetag));
		const uid = etag ?? `${mtime}~${size}`;
		return { isDir: false, key, meta, mtime, size, uid };
	}

	private toDescendantStats(key: string, items: Array<WebDAVResponseItem>) {
		return items
			.filter((item) => !isTargetItem(key, this.endpoint, item))
			.map((item) => this.toStat(item))
			.filter((item): item is Stat => Boolean(item));
	}

	private async requestOrThrow(url: string, params: RequestParam = {}): Promise<RequestResponse> {
		const response = await this.options.request(url, { ...params, throw: false });
		if (response.status >= 200 && response.status < 300) return response;
		const error = new Error(
			parseWebDAVError(response.text()) ??
				`WebDAV request failed: ${response.status} ${params.method}`,
		);
		(error as { status?: number }).status = response.status;
		throw error;
	}

	getUid() {
		return `webdav~${this.endpoint}~${this.options.username}`;
	}

	async read(key: string) {
		const response = await this.requestOrThrow(buildUrl(this.endpoint, key));
		return response.bytes();
	}

	readStream(key: string, { size }: FileStat) {
		return createRangeReadStream({
			chunkSize,
			concurrency,
			requestRange: async (start, endInclusive) => {
				const response = await this.requestOrThrow(buildUrl(this.endpoint, key), {
					headers: {
						// Prevents intermediaries and servers from content-encoding the body, which makes them ignore the Range header and return the whole file: https://github.com/hesprs/sync-engine/issues/263
						'Accept-Encoding': 'identity',
						Range: `bytes=${start}-${endInclusive}`,
					},
					method: 'GET',
				});

				return response.bytes();
			},
			size,
		});
	}

	private async proppatch(key: string, meta: Dict<string>): Promise<void> {
		const metaJson = JSON.stringify(meta)
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;');
		const body = `<?xml version="1.0" encoding="utf-8"?>
<propertyupdate xmlns="DAV:" xmlns:se="${WEBDAV_PAGE}">
  <set>
    <prop>
      <se:meta>${metaJson}</se:meta>
    </prop>
  </set>
</propertyupdate>`;
		await this.requestOrThrow(buildUrl(this.endpoint, key), {
			body,
			contentType: 'application/xml',
			method: 'PROPPATCH',
		});
	}

	async write(key: string, value: Binary, stat: FileStat): Promise<string> {
		const [{ headers }, meta] = await Promise.all([
			this.requestOrThrow(buildUrl(this.endpoint, key), {
				body: value,
				method: 'PUT',
			}),
			this.resolveMeta(stat.meta),
		]);
		const etag = getObjectEtag(getHeader(headers, 'etag'));
		return Promise.all([
			etag ?? this.stat(key).then((newStat) => getFileUid(newStat, key)),
			meta ? this.proppatch(key, meta) : Promise.resolve(),
		]).then(([uid]) => uid);
	}

	async writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		const { chunkedUpload, username } = this.options;
		if (!chunkedUpload) return this.write(key, await collectStreamToBinary(value), stat);
		return writeNextcloudChunkedUpload(
			{
				endpoint: this.endpoint,
				patchMeta: async () => {
					const meta = await this.resolveMeta(stat.meta);
					if (meta) return this.proppatch(key, meta);
				},
				request: this.requestOrThrow.bind(this),
				stat: (targetKey) => this.stat(targetKey),
				username,
			},
			key,
			value,
			stat.size,
		);
	}

	async delete(key: string) {
		try {
			await this.requestOrThrow(buildUrl(this.endpoint, key), { method: 'DELETE' });
		} catch (error) {
			if (getStatus(error) === 404) return;
			throw error;
		}
	}

	async move(oldKey: string, newKey: string) {
		await this.requestOrThrow(buildUrl(this.endpoint, oldKey), {
			headers: { Destination: buildUrl(this.endpoint, newKey) },
			method: 'MOVE',
		});
	}

	async mkdir(key: string, stat: FolderStat, recursive?: boolean) {
		const directoryKeys = recursive ? getRecursiveKeys(key) : [key];
		const mkcols = async () => {
			for (const directoryKey of directoryKeys)
				try {
					await this.requestOrThrow(buildUrl(this.endpoint, directoryKey), {
						method: 'MKCOL',
					});
				} catch (error) {
					if (getStatus(error) !== 405) throw error;
				}
		};
		const [meta] = await Promise.all([this.resolveMeta(stat.meta), mkcols()]);
		if (meta) await this.proppatch(key, meta);
	}

	async stat(key: string): Promise<Stat> {
		const items = await this.propfind({ key });
		const item = items.find((candidate) => isTargetItem(key, this.endpoint, candidate));
		if (!item) throw new Error(`WebDAV stat not found for "${key}"`);
		const stat = this.toStat(item);
		if (!stat) throw new Error(`WebDAV stat not found for "${key}"`);
		return stat;
	}

	async exists(key: string): Promise<boolean> {
		try {
			const items = await this.propfind({ key });
			const item = items.find((candidate) => isTargetItem(key, this.endpoint, candidate));
			return Boolean(item);
		} catch (error: unknown) {
			if (getStatus(error) === 404) return false;
			throw error;
		}
	}

	private async listStats(key: string, depth: '1' | 'infinity' = '1') {
		const items = await this.propfind({ depth, key });
		return this.toDescendantStats(key, items);
	}

	async list(key: string, reporter: ListReporter) {
		if (this.options.depthInfinity) {
			const stats = await this.listStats(key, 'infinity');
			const result: Array<Stat> = [];
			await Promise.all(
				stats.map(async (stat, index) => {
					if (
						(await reporter({
							completed: index + 1,
							current: stat.key,
							total: stats.length,
						})) === 'exclude'
					)
						return;
					result.push(stat);
				}),
			);
			return result;
		}
		const result: Array<Stat> = [];
		let completed = 1;
		let total = 1;
		const visit = async (dir: string) => {
			const items = await this.listStats(dir);
			completed++;
			total += items.length;
			await Promise.all(
				items.map(async (item) => {
					const report = await reporter({ completed, current: item.key, total });
					if (report !== 'advance') completed++;
					if (report === 'exclude') return;
					result.push(item);
					if (report === 'include') return;
					if (item.isDir) await visit(item.key);
				}),
			);
		};
		await visit(key);
		return result;
	}
}
