import type { Binary, RequestParam, Stat } from '@hesprs/sync-engine-sdk';
import { concatBinary, textToUint8Array } from '@repo/shared/binary';
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
	const inFlight = new Set<Promise<unknown>>();
	const parts: Array<{ partNumber: number; etag: string }> = [];
	let nextPartNumber = 1;
	let pending = new Uint8Array(0);
	let uploadId: string | undefined;
	const reader = value.getReader();

	const trackPart = (promise: Promise<unknown>) => {
		inFlight.add(promise);
		promise.then(
			() => inFlight.delete(promise),
			() => {},
		);
	};

	const waitForSlot = async () => {
		while (inFlight.size >= MAX_CONCURRENT) await Promise.race(inFlight);
	};

	try {
		const initiatedUrl = buildUrlWithQuery(
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
			url: initiatedUrl,
		});
		const parsedUploadId = parseUploadId(initiateResponse.text());
		uploadId = parsedUploadId;
		const enqueuePart = async (chunk: Binary) => {
			await waitForSlot();
			const partNumber = nextPartNumber++;
			trackPart(
				uploadPart(options, parsedUploadId, partNumber, chunk).then((result) =>
					parts.push(result),
				),
			);
		};

		while (true) {
			const { done, value: chunk } = await reader.read();
			if (done) break;
			pending = concatBinary(pending, chunk);
			while (pending.byteLength >= PART_SIZE) {
				const part = pending.slice(0, PART_SIZE);
				pending = pending.slice(PART_SIZE);
				await enqueuePart(part);
			}
		}
		if (pending.byteLength > 0) await enqueuePart(pending);
		await Promise.all(inFlight);

		parts.sort((a, b) => a.partNumber - b.partNumber);
		const completeBody = buildCompleteMultipartXml(parts);
		const completeUrl = buildUrlWithQuery(
			{
				bucket: options.bucket,
				endpoint: options.endpoint,
				key: options.key,
				urlStyle: options.urlStyle,
			},
			{ uploadId: parsedUploadId },
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
		await Promise.allSettled(inFlight);
		if (uploadId) await abortMultipart(options, uploadId);
		throw error;
	} finally {
		reader.releaseLock();
	}
}
