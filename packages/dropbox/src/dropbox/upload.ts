import { API_CONTENT, escapeHeaderJson, request2xx } from './api';
import chunkedUpload from '@repo/shared/chunked-upload';
import type { FileMetadata, UploadArg } from './api';
import type { Binary, Request, StringKV } from '@hesprs/sync-engine-sdk';

/** Fixed 2^22-byte chunk: the concurrent-session alignment unit, independent of SDK settings. */
export const SESSION_CHUNK_SIZE = 4 * 1024 ** 2;

/** Concurrent appends in flight, ~16 MiB total, matching the 16 MiB stream reservation. */
const CONCURRENT_APPENDS = 4;

type UploadOptions = { request: Request; arg: UploadArg };

export async function read2xx(
	request: Request,
	url: string,
	params: { body?: Binary; headers: StringKV },
): Promise<FileMetadata> {
	const response = await request2xx(request, url, { ...params, method: 'POST' });
	return response.json<FileMetadata>();
}

/**
 * Concurrent upload session: an empty `start`, then 4 MiB-aligned data appends fired with bounded
 * concurrency. The close takes two ordered requests: the final append carries `close: true` and is
 * sent only once every earlier append is acknowledged, then the empty `finish` commits the file.
 *
 * A failed upload leaves the session to the server: `files/upload_session/abort` no longer exists
 * (the route answers 404), and the API reaps unused sessions after at most 7 days.
 */
export async function concurrentUploadSession(
	{ arg, request }: UploadOptions,
	value: ReadableStream<Binary>,
): Promise<FileMetadata> {
	const started = await request2xx(request, `${API_CONTENT}/2/files/upload_session/start`, {
		headers: {
			'Dropbox-API-Arg': escapeHeaderJson({
				close: false,
				session_type: { '.tag': 'concurrent' },
			}),
		},
		method: 'POST',
	});
	const { session_id: sessionId } = started.json<{ session_id: string }>();
	let total = 0;
	const appends: Array<Promise<FileMetadata>> = [];
	await chunkedUpload({
		chunkSize: SESSION_CHUNK_SIZE,
		concurrency: CONCURRENT_APPENDS,
		uploadChunk: async (chunk, _index, offset, isLast) => {
			total = offset + chunk.byteLength;
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
