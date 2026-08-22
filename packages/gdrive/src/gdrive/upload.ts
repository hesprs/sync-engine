import type { Binary, Request, RequestResponse } from '@hesprs/sync-engine-sdk';
import { concatBinary, textToUint8Array } from '@repo/shared/binary';
import type { DriveFile } from './api';
import { getHeader, parseDriveError } from './api';

/** Google Drive resumable uploads require chunk sizes in multiples of 256 KiB. */
export const RESUMABLE_CHUNK_SIZE = 5 * 1024 * 1024;

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

/**
 * Content type declared for uploaded bytes so files keep useful previews in
 * the Drive web interface.
 */
export function guessMimeType(name: string): string {
	const dotIndex = name.lastIndexOf('.');
	if (dotIndex === -1) return 'application/octet-stream';
	const extension = name.slice(dotIndex + 1).toLowerCase();
	return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export type SessionOptions = {
	initiateUrl: string;
	method: 'PATCH' | 'POST';
	metadata: object;
	request: Request;
	size: number;
};

async function startSession({
	initiateUrl,
	method,
	metadata,
	request,
	size,
}: SessionOptions): Promise<{ request: Request; location: string }> {
	const response = await request({
		body: textToUint8Array(JSON.stringify(metadata)),
		headers: {
			'Content-Type': 'application/json; charset=UTF-8',
			'X-Upload-Content-Length': String(size),
		},
		method,
		url: initiateUrl,
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

/** Returns `undefined` when Drive answers 308 (chunk stored, upload incomplete). */
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
		url: location,
	});
	if (response.status === 308) return undefined;
	if (response.status >= 200 && response.status < 300) return response;
	throw new Error(parseDriveError(response) ?? `Google Drive upload failed: ${response.status}`);
}

/** Uploads the whole value in a single PUT on a resumable session. */
export async function singlePutUpload(options: SessionOptions, value: Binary): Promise<DriveFile> {
	const session = await startSession(options);
	const response = await putChunk(session, value, 0, value.byteLength);
	if (response === undefined) throw new Error('Google Drive upload ended prematurely.');
	return response.json() as DriveFile;
}

export async function resumableUpload(
	options: SessionOptions,
	value: ReadableStream<Binary>,
): Promise<DriveFile> {
	const session = await startSession(options);
	const total = options.size;
	let offset = 0;
	let final: RequestResponse | undefined;
	const reader = value.getReader();
	let pending = new Uint8Array(0);
	try {
		while (final === undefined) {
			const { done, value: chunk } = await reader.read();
			if (done) break;
			pending = concatBinary(pending, chunk);
			// Hold back at least one byte so the closing chunk is never empty.
			while (pending.byteLength > RESUMABLE_CHUNK_SIZE && final === undefined) {
				const part = pending.slice(0, RESUMABLE_CHUNK_SIZE);
				pending = pending.slice(RESUMABLE_CHUNK_SIZE);
				final = await putChunk(session, part, offset, total);
				offset += part.byteLength;
			}
		}
		final ??= await putChunk(session, pending, offset, total);
	} catch (error) {
		// Best-effort session cancellation; Drive also expires sessions on its own.
		await options.request({ method: 'DELETE', url: session.location }).catch(() => {});
		throw error;
	} finally {
		reader.releaseLock();
	}
	if (final === undefined) throw new Error('Google Drive upload finished incomplete.');
	return final.json() as DriveFile;
}
