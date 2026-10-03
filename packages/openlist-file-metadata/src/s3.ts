import type { Request, RequestResponse } from '@hesprs/sync-engine-sdk';
import parseXML from '@repo/shared/parse-xml';
import type { Target } from './target';
import type { FileTimes } from './times';
import { canonicalUrl, header, setHeaders } from './target';
import { timeValue } from './times';

export function s3Times(headers: Record<string, string>): FileTimes {
	const custom = header(headers, 'x-amz-meta-mtime');
	const precise =
		custom?.trim() && /^-?\d+(?:\.\d+)?$/u.test(custom)
			? timeValue(Number(custom) * 1000)
			: undefined;
	const modified = header(headers, 'last-modified');
	return { mtime: precise ?? (modified ? timeValue(Date.parse(modified)) : undefined) };
}

export function s3ObjectResponse(response: RequestResponse): RequestResponse {
	let headers = response.headers;
	const etag = header(headers, 'etag');
	// OpenList may return an empty quoted ETag. Let the backend use its stat UID.
	if (etag !== undefined && !etag.replaceAll('"', '').trim())
		headers = Object.fromEntries(
			Object.entries(headers).filter(([key]) => key.toLowerCase() !== 'etag'),
		);
	const { mtime } = s3Times(headers);
	if (mtime !== undefined && header(headers, 'last-modified'))
		headers = setHeaders(headers, { 'Last-Modified': new Date(mtime).toUTCString() });
	return { ...response, headers };
}

export async function s3ListResponse(options: {
	response: RequestResponse;
	request: Request;
	target: Target;
	received: Map<string, FileTimes>;
}): Promise<RequestResponse> {
	const { response, request, target, received } = options;
	const text = response.text();
	const entries = [...text.matchAll(/<Contents(?:\s[^>]*)?>[\s\S]*?<\/Contents>/gu)];
	const replacements = new Map<string, string>();
	// A missing ETag requires consistent stat-based identity. Some OpenList
	// Versions also format listing dates in local time with a literal Z suffix.
	// Query only these entries, through the existing authenticated request stack.
	for (let offset = 0; offset < entries.length; offset += 8)
		await Promise.all(
			entries.slice(offset, offset + 8).map(async ([entry]) => {
				const { Contents: object } = parseXML<{
					Contents: { Key?: string; ETag?: unknown; Size?: string };
				}>(entry);
				if (!object.Key || object.Key.endsWith('/')) return;
				// OpenList uses this synthetic object for empty directories.
				if (
					object.Key.split('/').at(-1) === 'ThisIsAnEmptyFolderInTheS3Bucket' &&
					object.Size === '0'
				) {
					replacements.set(entry, '');
					return;
				}
				if (typeof object.ETag === 'string' && object.ETag.replaceAll('"', '').trim())
					return;
				const url = target.url(object.Key);
				const info = await request(url, { method: 'HEAD', throw: false });
				if (info.status < 200 || info.status >= 300)
					throw Object.assign(
						new Error(`Cannot read OpenList file metadata: HTTP ${info.status}`),
						{ status: info.status },
					);
				const times = s3Times(info.headers);
				received.set(canonicalUrl(url), times);
				let normalized = entry.replaceAll(/<ETag\b[^>]*(?:\/>|>[\s\S]*?<\/ETag>)/gu, '');
				const etag = header(info.headers, 'etag');
				if (etag?.replaceAll?.('"', '')?.trim()) {
					const escaped = etag
						.replaceAll('&', '&amp;')
						.replaceAll('<', '&lt;')
						.replaceAll('>', '&gt;');
					normalized = normalized.replace(
						'</Contents>',
						`<ETag>${escaped}</ETag></Contents>`,
					);
				}
				const size = header(info.headers, 'content-length');
				if (size && /^\d+$/u.test(size))
					normalized = normalized.replace(/<Size>[^<]*<\/Size>/u, `<Size>${size}</Size>`);
				if (times.mtime !== undefined)
					normalized = normalized.replace(
						/<LastModified>[^<]*<\/LastModified>/u,
						`<LastModified>${new Date(Math.floor(times.mtime / 1000) * 1000).toISOString()}</LastModified>`,
					);
				replacements.set(entry, normalized);
			}),
		);
	return {
		...response,
		text: () =>
			text.replaceAll(
				/<Contents(?:\s[^>]*)?>[\s\S]*?<\/Contents>/gu,
				(entry) => replacements.get(entry) ?? entry,
			),
	};
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
