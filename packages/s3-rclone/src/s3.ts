import type { FileStat, Request, RequestResponse } from '@hesprs/sync-engine-sdk';
import normalizeEtag from '@repo/shared/normalize-etag';
import parseXML from '@repo/shared/parse-xml';
import type { Target } from './target';
import { header } from './target';
import { cacheMeta, timeValue } from './times';

type ObjectEntry = { Key?: string; ETag?: unknown; Size?: string; LastModified?: string };
type Listing = {
	ListBucketResult: {
		Contents?: ObjectEntry | Array<ObjectEntry>;
		IsTruncated?: string;
		NextContinuationToken?: string;
	};
};

export function objectUid(etag: unknown, mtime: number, size: number): string {
	const normalized = typeof etag === 'string' ? normalizeEtag(etag) : '';
	return normalized.trim() ? normalized : `${Math.floor(mtime / 1000) * 1000}~${size}`;
}

export function objectInfo(key: string, modified?: string, length?: string) {
	const mtime = modified ? timeValue(Date.parse(modified)) : undefined;
	const size = Number(length);
	if (mtime === undefined || !length?.trim() || !Number.isSafeInteger(size) || size < 0)
		throw new Error(`Invalid S3 rclone file metadata: ${key}`);
	return { mtime, size };
}

export function extractMeta(headers: Record<string, string>): Dict<string> {
	const meta: Dict<string> = {};
	for (const [name, value] of Object.entries(headers)) {
		const lower = name.toLowerCase();
		if (lower.startsWith('x-amz-meta-')) meta[lower.slice(11)] = value;
	}
	return meta;
}

function fileStat(key: string, object: ObjectEntry, meta: FileStat['meta']): FileStat {
	const { mtime, size } = objectInfo(key, object.LastModified, object.Size);
	return { isDir: false, key, meta, mtime, size, uid: objectUid(object.ETag, mtime, size) };
}

async function head(request: Request, target: Target, key: string) {
	const response = await request(target.url(key), { method: 'HEAD', throw: false });
	assertSuccess(response, 'metadata lookup');
	return response;
}

export async function s3Meta(request: Request | undefined, target: Target, key: string) {
	if (!target.fetchObjectMeta) return {};
	if (!request) throw new Error('S3 rclone request is unavailable.');
	return extractMeta((await head(request, target, key)).headers);
}

function assertSuccess(response: RequestResponse, operation: string) {
	if (response.status < 200 || response.status >= 300)
		throw Object.assign(new Error(`S3 rclone ${operation} failed: HTTP ${response.status}`), {
			status: response.status,
		});
}

export async function s3Stat(
	request: Request,
	target: Target,
	key: string,
	fastMode = false,
): Promise<FileStat> {
	if (fastMode) {
		const { headers } = await head(request, target, key);
		return fileStat(
			key,
			{
				ETag: header(headers, 'etag'),
				LastModified: header(headers, 'last-modified'),
				Size: header(headers, 'content-length'),
			},
			() => extractMeta(headers),
		);
	}
	const url = new URL(target.url('/'));
	url.searchParams.set('list-type', '2');
	url.searchParams.set('prefix', key);
	const tokens = new Set<string>();
	while (true) {
		const response = await request(url.toString(), { method: 'GET', throw: false });
		assertSuccess(response, 'file lookup');
		const { ListBucketResult: listing } = parseXML<Listing>(response.text());
		if (!listing) throw new Error('Invalid S3 rclone listing.');
		const entries = listing.Contents
			? Array.isArray(listing.Contents)
				? listing.Contents
				: [listing.Contents]
			: [];
		const object = entries.find((entry) => entry.Key === key);
		if (object)
			return fileStat(
				key,
				object,
				cacheMeta(() => s3Meta(request, target, key)),
			);
		if (listing.IsTruncated !== 'true')
			throw Object.assign(new Error(`S3 rclone file not found: ${key}`), { status: 404 });
		const token = listing.NextContinuationToken;
		if (!token || tokens.has(token))
			throw new Error('Incomplete S3 rclone listing pagination.');
		tokens.add(token);
		url.searchParams.set('continuation-token', token);
	}
}

export function s3MultipartResponse(response: RequestResponse): RequestResponse {
	const original = response.text();
	const text = original.replaceAll(
		/<(?<closing>\/?)InitiateMultipartUpload(?=[\s>])/gu,
		'<$<closing>InitiateMultipartUploadResult',
	);
	return text === original ? response : { ...response, text: () => text };
}
