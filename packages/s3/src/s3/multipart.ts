import type { Binary, RequestParam, Stat } from '@hesprs/sync-engine-sdk';
import { textToUint8Array } from '@repo/shared/binary';
import chunkedUpload from '@repo/shared/chunked-upload';
import parseXML from '@repo/shared/parse-xml';
import type { UrlStyle } from './sigv4';
import { buildUrlWithQuery, getHeader } from './url';

export const PART_SIZE = 5 * 1024 * 1024; // 5 MiB — S3 minimum part size
const MAX_CONCURRENT = 3;

type InitiateMultipartUploadResponse = {
	InitiateMultipartUploadResult?: {
		UploadId?: string;
	};
};

type CompleteMultipartUploadResponse = {
	CompleteMultipartUploadResult?: {
		ETag?: string;
	};
};

export type MultipartUploadOptions = {
	endpoint: string;
	bucket: string;
	urlStyle: UrlStyle;
	key: string;
	request: (params: RequestParam) => Promise<{
		headers: Record<string, string>;
		text: () => string;
	}>;
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
	const url = buildUrlWithQuery(
		{
			bucket: options.bucket,
			endpoint: options.endpoint,
			key: options.key,
			urlStyle: options.urlStyle,
		},
		{ partNumber: String(partNumber), uploadId },
	);
	const response = await options.request({
		body: chunk,
		headers: { 'Content-Type': 'application/octet-stream' },
		method: 'PUT',
		url,
	});
	const etag = getHeader(response.headers, 'etag');
	if (!etag) throw new Error(`S3 multipart: no ETag for part ${partNumber}`);
	return { etag, partNumber };
}

async function abortMultipart(options: MultipartUploadOptions, uploadId: string) {
	const url = buildUrlWithQuery(
		{
			bucket: options.bucket,
			endpoint: options.endpoint,
			key: options.key,
			urlStyle: options.urlStyle,
		},
		{ uploadId },
	);
	await options.request({ ignoreCancellation: true, method: 'DELETE', url }).catch(() => {});
}

export async function multipartUpload(
	options: MultipartUploadOptions,
	value: ReadableStream<Binary>,
): Promise<string> {
	const initiateUrl = buildUrlWithQuery(
		{
			bucket: options.bucket,
			endpoint: options.endpoint,
			key: options.key,
			urlStyle: options.urlStyle,
		},
		{ uploads: '' },
	);
	const initiateResponse = await options.request({
		headers: { 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
		method: 'POST',
		url: initiateUrl,
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
		const completeUrl = buildUrlWithQuery(
			{
				bucket: options.bucket,
				endpoint: options.endpoint,
				key: options.key,
				urlStyle: options.urlStyle,
			},
			{ uploadId },
		);
		const completeResponse = await options.request({
			body: textToUint8Array(completeBody),
			headers: { 'Content-Type': 'application/xml' },
			method: 'POST',
			url: completeUrl,
		});

		const etag = parseXML<CompleteMultipartUploadResponse>(completeResponse.text())
			.CompleteMultipartUploadResult?.ETag;
		if (etag) return etag;
		const stat = await options.stat(options.key);
		if (stat.isDir)
			throw new Error(`S3 multipart upload returned a folder stat for ${options.key}.`);
		return stat.uid;
	} catch (error) {
		await abortMultipart(options, uploadId);
		throw error;
	}
}
