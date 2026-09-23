import type { Binary, Request, Stat } from '@hesprs/sync-engine-sdk';
import { textToUint8Array } from '@repo/shared/binary';
import chunkedUpload from '@repo/shared/chunked-upload';
import normalizeEtag from '@repo/shared/normalize-etag';
import parseXML from '@repo/shared/parse-xml';
import type { UrlStyle } from './sigv4';
import { buildUrlWithQuery, getHeader } from './url';
import { getFileUid } from './utils';

export const PART_SIZE = 5 * 1024 * 1024; // 5 MiB — S3 minimum part size
const MAX_CONCURRENT = 3;

type InitiateMultipartUploadResponse = { InitiateMultipartUploadResult?: { UploadId?: string } };
type CompleteMultipartUploadResponse = { CompleteMultipartUploadResult?: { ETag?: string } };

export type MultipartUploadOptions = {
	endpoint: string;
	bucket: string;
	urlStyle: UrlStyle;
	key: string;
	request: Request;
	stat: (key: string) => Promise<Stat>;
};

function parseUploadId(xml: string): string {
	const uploadId =
		parseXML<InitiateMultipartUploadResponse>(xml).InitiateMultipartUploadResult?.UploadId;
	if (!uploadId) throw new Error('Failed to parse UploadId from S3 response');
	return uploadId;
}

function buildCompleteMultipartXml(parts: Array<{ partNumber: number; etag: string }>): string {
	const inner = parts
		.map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`)
		.join('');
	return `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>${inner}</CompleteMultipartUpload>`;
}

async function uploadPart(
	options: MultipartUploadOptions,
	uploadId: string,
	partNumber: number,
	chunk: Binary,
): Promise<{ partNumber: number; etag: string }> {
	const url = buildUrlWithQuery(options, { partNumber: String(partNumber), uploadId });
	const response = await options.request(url, {
		body: chunk,
		headers: { 'Content-Type': 'application/octet-stream' },
		method: 'PUT',
	});
	const etag = getHeader(response.headers, 'etag');
	if (!etag) throw new Error(`S3 multipart: no ETag for part ${partNumber}`);
	return { etag, partNumber };
}

function abortMultipart(options: MultipartUploadOptions, uploadId: string) {
	const url = buildUrlWithQuery(options, { uploadId });
	return options.request(url, { ignoreCancellation: true, method: 'DELETE' }).catch(() => {});
}

export async function multipartUpload(
	options: MultipartUploadOptions,
	value: ReadableStream<Binary>,
): Promise<string> {
	const { key, request, stat } = options;
	const initiateUrl = buildUrlWithQuery(options, { uploads: '' });
	const initiateResponse = await request(initiateUrl, {
		headers: { 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
		method: 'POST',
	});
	const uploadId = parseUploadId(initiateResponse.text());

	try {
		const parts = await chunkedUpload({
			chunkSize: PART_SIZE,
			concurrency: MAX_CONCURRENT,
			uploadChunk: (chunk, partNumber) => uploadPart(options, uploadId, partNumber, chunk),
			value,
		});

		const completeBody = buildCompleteMultipartXml(parts);
		const completeUrl = buildUrlWithQuery(options, { uploadId });
		const completeResponse = await request(completeUrl, {
			body: textToUint8Array(completeBody),
			headers: { 'Content-Type': 'application/xml' },
			method: 'POST',
		});

		const etag = parseXML<CompleteMultipartUploadResponse>(completeResponse.text())
			.CompleteMultipartUploadResult?.ETag;
		return etag ? normalizeEtag(etag) : getFileUid(await stat(key), key);
	} catch (error) {
		void abortMultipart(options, uploadId);
		throw error;
	}
}
