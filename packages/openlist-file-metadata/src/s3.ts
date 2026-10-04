import type { FileStat, Request, RequestResponse } from '@hesprs/sync-engine-sdk';
import normalizeEtag from '@repo/shared/normalize-etag';
import parseXML from '@repo/shared/parse-xml';
import type { Target } from './target';
import { header } from './target';
import { timeValue } from './times';

type ObjectEntry = { Key?: string; ETag?: unknown; Size?: string; LastModified?: string };
type Listing = {
	ListBucketResult: {
		Contents?: ObjectEntry | Array<ObjectEntry>;
		IsTruncated?: string;
		NextContinuationToken?: string;
	};
};

export function s3ObjectResponse(response: RequestResponse): RequestResponse {
	const etag = header(response.headers, 'etag');
	if (etag === undefined || normalizeEtag(etag)) return response;
	return {
		...response,
		headers: Object.fromEntries(
			Object.entries(response.headers).filter(([key]) => key.toLowerCase() !== 'etag'),
		),
	};
}

export async function s3Stat(request: Request, target: Target, key: string): Promise<FileStat> {
	const url = new URL(target.url('/'));
	url.searchParams.set('list-type', '2');
	url.searchParams.set('prefix', key);
	const tokens = new Set<string>();
	while (true) {
		const response = await request(url.toString(), { method: 'GET', throw: false });
		if (response.status < 200 || response.status >= 300)
			throw Object.assign(
				new Error(`OpenList S3 file lookup failed: HTTP ${response.status}`),
				{
					status: response.status,
				},
			);
		const { ListBucketResult: listing } = parseXML<Listing>(response.text());
		if (!listing) throw new Error('Invalid OpenList S3 listing.');
		const entries = listing.Contents
			? Array.isArray(listing.Contents)
				? listing.Contents
				: [listing.Contents]
			: [];
		const object = entries.find((entry) => entry.Key === key);
		if (object) {
			const mtime = object.LastModified
				? timeValue(Date.parse(object.LastModified))
				: undefined;
			const size = Number(object.Size);
			if (mtime === undefined || !Number.isSafeInteger(size) || size < 0 || !object.Size)
				throw new Error(`Invalid OpenList S3 file metadata: ${key}`);
			const etag = typeof object.ETag === 'string' ? normalizeEtag(object.ETag) : '';
			return { isDir: false, key, mtime, size, uid: etag || `${mtime}~${size}` };
		}
		if (listing.IsTruncated !== 'true')
			throw Object.assign(new Error(`OpenList S3 file not found: ${key}`), { status: 404 });
		const token = listing.NextContinuationToken;
		if (!token || tokens.has(token))
			throw new Error('Incomplete OpenList S3 listing pagination.');
		tokens.add(token);
		url.searchParams.set('continuation-token', token);
	}
}

export function s3MultipartResponse(response: RequestResponse): RequestResponse {
	const text = response
		.text()
		.replaceAll(
			/<(?<closing>\/?)InitiateMultipartUpload(?=[\s>])/gu,
			'<$<closing>InitiateMultipartUploadResult',
		);
	return { ...response, text: () => text };
}
