import type { Binary, Request, Stat } from '@hesprs/sync-engine-sdk';
import chunkedUpload from '@repo/shared/chunked-upload';
import { encodeURIComponent3986 } from '@repo/shared/path';
import { buildUrl, getFileUid, getHeader, getObjectEtag } from './utils';

// Nextcloud rejects non-final chunks below 5 MiB
const NEXTCLOUD_CHUNK_SIZE = 5 * 1024 * 1024;
const NEXTCLOUD_MAX_CONCURRENT = 3;

type NextcloudChunkedUploadOptions = {
	endpoint: string;
	request: Request;
	stat: (key: string) => Promise<Stat>;
	patchMeta: () => Promise<void>;
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

function deleteChunkUpload(request: Request, uploadFolderUrl: string) {
	return request(uploadFolderUrl, { ignoreCancellation: true, method: 'DELETE' }).catch(() => {});
}

export default async function writeNextcloudChunkedUpload(
	{ endpoint, username, request, stat, patchMeta }: NextcloudChunkedUploadOptions,
	key: string,
	value: ReadableStream<Binary>,
	size: number,
): Promise<string> {
	const uploadId = crypto.randomUUID();
	const uploadEndpoint = getUploadEndpoint(endpoint, username);
	const uploadFolderKey = `${uploadId}/`;
	const uploadFolderUrl = buildUrl(uploadEndpoint, uploadFolderKey);
	const uploadFileUrl = buildUrl(uploadEndpoint, `${uploadId}/.file`);
	const Destination = buildUrl(endpoint, key);

	await request(uploadFolderUrl, { headers: { Destination }, method: 'MKCOL' });

	try {
		await chunkedUpload({
			chunkSize: NEXTCLOUD_CHUNK_SIZE,
			concurrency: NEXTCLOUD_MAX_CONCURRENT,
			uploadChunk: async (chunk, chunkNumber) => {
				await request(buildUrl(uploadEndpoint, `${uploadFolderKey}${chunkNumber}`), {
					body: chunk,
					headers: { Destination, 'OC-Total-Length': String(size) },
					method: 'PUT',
				});
			},
			value,
		});

		const response = await request(uploadFileUrl, {
			headers: { Destination },
			method: 'MOVE',
		});

		const etag =
			getObjectEtag(getHeader(response.headers, 'etag')) ??
			getObjectEtag(getHeader(response.headers, 'oc-etag'));
		const [uid] = await Promise.all([
			etag ?? stat(key).then((newStat) => getFileUid(newStat, key)),
			patchMeta(),
		]);
		return uid;
	} catch (error) {
		void deleteChunkUpload(request, uploadFolderUrl);
		throw error;
	}
}
