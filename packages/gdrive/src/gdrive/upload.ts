import type { Binary, Request, RequestResponse } from '@hesprs/sync-engine-sdk';
import { chunkSize, concurrency } from '@hesprs/sync-engine-sdk';
import { concatBinary, textToUint8Array } from '@repo/shared/binary';
import chunkedUpload from '@repo/shared/chunked-upload';
import type { DriveFile } from './api';
import { getHeader, parseDriveError } from './api';

const MIME_BY_EXTENSION: Record<string, string> = {
	base: 'application/json',
	canvas: 'application/json',
	css: 'text/css',
	gif: 'image/gif',
	html: 'text/html',
	jpeg: 'image/jpeg',
	jpg: 'image/jpeg',
	js: 'text/javascript',
	json: 'application/json',
	m4a: 'audio/mp4',
	md: 'text/markdown',
	mp3: 'audio/mpeg',
	mp4: 'video/mp4',
	pdf: 'application/pdf',
	png: 'image/png',
	svg: 'image/svg+xml',
	txt: 'text/plain',
	webm: 'video/webm',
	webp: 'image/webp',
};

// Content type declared for uploaded bytes so files keep useful previews in the Drive web interface.
export function guessMimeType(name: string): string {
	const dotIndex = name.lastIndexOf('.');
	if (dotIndex === -1) return 'application/octet-stream';
	const extension = name.slice(dotIndex + 1).toLowerCase();
	return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export type UploadOptions = {
	method: 'PATCH' | 'POST';
	metadata: object;
	request: Request;
	url: string;
};

export type MultipartOptions = UploadOptions & { mimeType: string };

export type SessionOptions = UploadOptions & { size: number };

async function startSession({
	method,
	metadata,
	request,
	size,
	url,
}: SessionOptions): Promise<{ request: Request; location: string }> {
	const response = await request({
		body: textToUint8Array(JSON.stringify(metadata)),
		headers: {
			'Content-Type': 'application/json; charset=UTF-8',
			'X-Upload-Content-Length': String(size),
		},
		method,
		throw: false,
		url,
	});
	if (response.status < 200 || response.status >= 300)
		throw new Error(
			parseDriveError(response) ??
				`Google Drive upload session initiation failed: ${response.status}`,
		);
	const location = getHeader(response.headers, 'location');
	if (!location) throw new Error('Google Drive did not return an upload session URL!');
	return { location, request };
}

// Returns `undefined` when Drive answers 308 (chunk stored, upload incomplete).
async function putChunk(
	{ request, location }: { request: Request; location: string },
	chunk: Binary,
	start: number,
	total: number,
): Promise<RequestResponse | undefined> {
	const end = start + chunk.byteLength - 1;
	const response = await request({
		body: chunk,
		headers: {
			'Content-Range': end < start ? `bytes */${total}` : `bytes ${start}-${end}/${total}`,
		},
		method: 'PUT',
		throw: false,
		url: location,
	});
	if (response.status === 308) return;
	if (response.status >= 200 && response.status < 300) return response;
	throw new Error(parseDriveError(response) ?? `Google Drive upload failed: ${response.status}`);
}

// Multipart upload sends metadata and content in a single request; no session needed.
const createBoundary = () => `sync-engine-${crypto.randomUUID()}`;
export async function singleUpload(options: MultipartOptions, value: Binary): Promise<DriveFile> {
	const boundary = createBoundary();
	const body = concatBinary(
		textToUint8Array(
			`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(options.metadata)}\r\n--${boundary}\r\nContent-Type: ${options.mimeType}\r\n\r\n`,
		),
		value,
		textToUint8Array(`\r\n--${boundary}--`),
	);
	const response = await options.request({
		body,
		headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
		method: options.method,
		throw: false,
		url: options.url,
	});
	if (response.status < 200 || response.status >= 300)
		throw new Error(
			parseDriveError(response) ?? `Google Drive upload failed: ${response.status}`,
		);
	return response.json<DriveFile>();
}

export async function resumableUpload(
	options: SessionOptions,
	value: ReadableStream<Binary>,
): Promise<DriveFile> {
	const session = await startSession(options);
	const total = options.size;
	let final: RequestResponse | undefined;
	await chunkedUpload<RequestResponse | undefined>({
		chunkSize,
		concurrency,
		onChunkResult: (response) => {
			if (response) final = response;
		},
		uploadChunk: (chunk, _index, offset) => putChunk(session, chunk, offset, total),
		value,
	}).catch(async (error: unknown) => {
		// Best-effort session cancellation; Drive also expires sessions on its own.
		await options.request({ method: 'DELETE', url: session.location }).catch(() => {});
		throw error;
	});
	final ??= await putChunk(session, new Uint8Array(0), total, total);
	if (!final) throw new Error('Google Drive upload finished incomplete.');
	return final.json<DriveFile>();
}
