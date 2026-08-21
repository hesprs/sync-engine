import type { Binary, FileStat, RequestParam, RequestResponse } from '@hesprs/sync-engine-sdk';
import { concatBinary, textToUint8Array } from '@repo/shared/binary';
import type { DriveFile } from './api';
import { getHeader, parseDriveError, safeJson } from './api';

/** Google Drive resumable uploads require chunk sizes in multiples of 256 KiB. */
export const RESUMABLE_CHUNK_SIZE = 8 * 1024 * 1024;

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

let boundaryCounter = 0;

export function buildMultipartBody(
	metadata: object,
	content: Binary,
	contentMimeType: string,
): { body: Binary; contentType: string } {
	boundaryCounter++;
	const boundary = `sync-engine-gdrive-${boundaryCounter.toString(36)}-${Math.random().toString(36).slice(2)}`;
	const head = textToUint8Array(
		`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${contentMimeType}\r\n\r\n`,
	);
	const tail = textToUint8Array(`\r\n--${boundary}--`);
	return {
		body: concatBinary(head, content, tail),
		contentType: `multipart/related; boundary=${boundary}`,
	};
}

export type ResumableUploadOptions = {
	initiateUrl: string;
	method: 'PATCH' | 'POST';
	metadata: object;
	stat: FileStat;
	/** Raw composed request — resumable chunk responses use non-2xx status 308. */
	request: (params: RequestParam) => Promise<RequestResponse>;
};

export async function resumableUpload(
	options: ResumableUploadOptions,
	value: ReadableStream<Binary>,
): Promise<DriveFile> {
	const initiate = await options.request({
		body: textToUint8Array(JSON.stringify(options.metadata)),
		headers: {
			'Content-Type': 'application/json; charset=UTF-8',
			'X-Upload-Content-Length': String(options.stat.size),
		},
		method: options.method,
		url: options.initiateUrl,
	});
	if (initiate.status < 200 || initiate.status >= 300)
		throw new Error(
			parseDriveError(initiate) ??
				`Google Drive resumable upload initiation failed: ${initiate.status}`,
		);
	const location = getHeader(initiate.headers, 'location');
	if (!location) throw new Error('Google Drive did not return a resumable upload session URL!');

	const total = options.stat.size;
	let offset = 0;
	let final: RequestResponse | undefined;
	const putChunk = async (
		chunk: Binary,
		isLast: boolean,
	): Promise<RequestResponse | undefined> => {
		const start = offset;
		const end = offset + chunk.byteLength - 1;
		offset += chunk.byteLength;
		const response = await options.request({
			body: chunk,
			headers: { 'Content-Range': `bytes ${start}-${end}/${total}` },
			method: 'PUT',
			url: location,
		});
		if (response.status === 308) {
			if (isLast) throw new Error('Google Drive resumable upload ended prematurely.');
			return undefined;
		}
		if (response.status >= 200 && response.status < 300) return response;
		throw new Error(
			parseDriveError(response) ?? `Google Drive resumable upload failed: ${response.status}`,
		);
	};

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
				final = await putChunk(part, false);
			}
		}
		final ??= await putChunk(pending, true);
	} catch (error) {
		// Best-effort session cancellation; Drive also expires sessions on its own.
		await options.request({ method: 'DELETE', url: location }).catch(() => {});
		throw error;
	} finally {
		reader.releaseLock();
	}
	if (final === undefined)
		throw new Error('Google Drive resumable upload finished without a response.');
	return safeJson(final) as DriveFile;
}
