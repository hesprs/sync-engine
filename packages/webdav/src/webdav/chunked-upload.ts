import type { Binary, RequestParam, RequestResponse, Stat } from '@hesprs/sync-engine-sdk';
import chunkedUpload from '@repo/shared/chunked-upload';
import { encodeURIComponent3986 } from '@repo/shared/path';
import { buildUrl, getFileUid, getHeader } from './utils';

type ThrowRequest = (params: RequestParam) => Promise<RequestResponse>;

// Nextcloud rejects non-final chunks below 5 MiB
const NEXTCLOUD_CHUNK_SIZE = 5 * 1024 * 1024;
const NEXTCLOUD_MAX_CONCURRENT = 3;

type NextcloudChunkedUploadOptions = {
	auth: string;
	endpoint: string;
	request: ThrowRequest;
	stat: (key: string) => Promise<Stat>;
	username: string;
};

function getUploadEndpoint(endpoint: string, username: string) {
	const encodedUsername = encodeURIComponent3986(username);
	const filesMarker = '/files/';
	const filesMarkerIndex = endpoint.lastIndexOf(filesMarker);
	return filesMarkerIndex === -1
		? `${endpoint}/uploads/${encodedUsername}`
		: `${endpoint.slice(0, filesMarkerIndex)}/uploads/${encodedUsername}`;
}

function deleteChunkUpload(request: ThrowRequest, auth: string, uploadFolderUrl: string) {
	return request({
		headers: { Authorization: auth },
		ignoreCancellation: true,
		method: 'DELETE',
		url: uploadFolderUrl,
	}).catch(() => {});
}

export default async function writeNextcloudChunkedUpload(
	options: NextcloudChunkedUploadOptions,
	key: string,
	value: ReadableStream<Binary>,
	size: number,
): Promise<string> {
	const uploadId = crypto.randomUUID();
	const uploadEndpoint = getUploadEndpoint(options.endpoint, options.username);
	const uploadFolderKey = `${uploadId}/`;
	const uploadFolderUrl = buildUrl(uploadEndpoint, uploadFolderKey);
	const uploadFileUrl = buildUrl(uploadEndpoint, `${uploadId}/.file`);
	const destination = buildUrl(options.endpoint, key);

	await options.request({
		headers: { Authorization: options.auth, Destination: destination },
		method: 'MKCOL',
		url: uploadFolderUrl,
	});

	try {
		await chunkedUpload({
			chunkSize: NEXTCLOUD_CHUNK_SIZE,
			concurrency: NEXTCLOUD_MAX_CONCURRENT,
			uploadChunk: async (chunk, chunkNumber) => {
				await options.request({
					body: chunk,
					headers: {
						Authorization: options.auth,
						Destination: destination,
						'OC-Total-Length': String(size),
					},
					method: 'PUT',
					url: buildUrl(uploadEndpoint, `${uploadFolderKey}${chunkNumber}`),
				});
			},
			value,
		});

		const response = await options.request({
			headers: { Authorization: options.auth, Destination: destination },
			method: 'MOVE',
			url: uploadFileUrl,
		});

		const etag = getHeader(response.headers, 'etag') ?? getHeader(response.headers, 'oc-etag');
		if (etag) return etag;
		return getFileUid(await options.stat(key), key);
	} catch (error) {
		void deleteChunkUpload(options.request, options.auth, uploadFolderUrl);
		throw error;
	}
}
