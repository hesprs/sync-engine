import { API_CONTENT, escapeHeaderJson, request2xx } from './api';
import chunkedUpload from '@repo/shared/chunked-upload';
import type { FileMetadata, UploadArg } from './api';
import type { Binary, Request } from '@hesprs/sync-engine-sdk';

/** Fixed 2^22-byte chunk: the concurrent-session alignment unit, independent of SDK settings. */
export const SESSION_CHUNK_SIZE = 4 * 1024 ** 2;

/** Concurrent appends in flight, ~16 MiB total, matching the 16 MiB stream reservation. */
const CONCURRENT_APPENDS = 4;

type UploadOptions = { request: Request; arg: UploadArg };

/** Posts to a content endpoint and parses the metadata, throwing on a non-2xx response. */
export async function read2xx(
	request: Request,
	url: string,
	params: { body?: Binary; headers: Record<string, string> },
): Promise<FileMetadata> {
	const response = await request2xx(
		request,
		url,
		{ ...params, method: 'POST' },
		'Dropbox upload failed',
	);
	return response.json<FileMetadata>();
}

/**
 * Concurrent upload session: an empty `start`, then 4 MiB-aligned data appends fired with bounded
 * concurrency. The close takes two ordered requests: the final append carries `close: true` and is
 * sent only once every earlier append is acknowledged, then the empty `finish` commits the file.
 */
export async function concurrentUploadSession(
	{ arg, request }: UploadOptions,
	value: ReadableStream<Binary>,
): Promise<FileMetadata> {
	const started = await request2xx(
		request,
		`${API_CONTENT}/2/files/upload_session/start`,
		{
			headers: {
				'Dropbox-API-Arg': escapeHeaderJson({
					close: false,
					session_type: { '.tag': 'concurrent' },
				}),
			},
			method: 'POST',
		},
		'Dropbox upload session start failed',
	);
	const { session_id: sessionId } = started.json<{ session_id: string }>();
	if (!sessionId) throw new Error('Dropbox did not return an upload session id!');

	let total = 0;
	const appends: Array<Promise<FileMetadata>> = [];
	await chunkedUpload({
		chunkSize: SESSION_CHUNK_SIZE,
		concurrency: CONCURRENT_APPENDS,
		uploadChunk: async (chunk, _index, offset, isLast) => {
			total = offset + chunk.byteLength;
			// The closing append turns `close` on, so it must not overtake data appends still in flight: send it only once every earlier append is acknowledged.
			if (isLast) await Promise.all(appends);
			const append = read2xx(request, `${API_CONTENT}/2/files/upload_session/append_v2`, {
				body: chunk,
				headers: {
					'Content-Type': 'application/octet-stream',
					'Dropbox-API-Arg': escapeHeaderJson({
						close: isLast,
						cursor: { offset, session_id: sessionId },
					}),
				},
			});
			appends.push(append);
			return append;
		},
		value,
	});

	return read2xx(request, `${API_CONTENT}/2/files/upload_session/finish`, {
		headers: {
			'Dropbox-API-Arg': escapeHeaderJson({
				commit: arg,
				cursor: { offset: total, session_id: sessionId },
			}),
		},
	});
}
