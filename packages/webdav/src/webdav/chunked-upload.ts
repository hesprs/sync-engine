import { buildUrl, getFileUid } from './utils';
import chunkedUpload from '@repo/shared/chunked-upload';
import normalizeEtag from '@repo/shared/normalize-etag';
import { encodeUrlPart } from '@repo/shared/path';
import type { ResolvedMeta } from './fs';
import type { Binary, Request, Stat, StringKV } from '@hesprs/sync-engine-sdk';

// Nextcloud rejects non-final chunks below 5 MiB
const NEXTCLOUD_CHUNK_SIZE = 5 * 1024 * 1024;
const NEXTCLOUD_MAX_CONCURRENT = 3;

type NextcloudChunkedUploadOptions = {
	endpoint: string;
	request: Request;
	stat: (key: string) => Promise<Stat>;
	proppatch: (key: string, meta: StringKV) => Promise<void>;
	resolveMeta: () => Promise<ResolvedMeta>;
	username: string;
};

function getUploadEndpoint(endpoint: string, username: string) {
	const encodedUsername = encodeUrlPart(username);
	const filesMarkerIndex = endpoint.lastIndexOf('/files/');
	return filesMarkerIndex === -1
		? `${endpoint}/uploads/${encodedUsername}`
		: `${endpoint.slice(0, filesMarkerIndex)}/uploads/${encodedUsername}`;
}

function deleteChunkUpload(request: Request, uploadFolderUrl: string) {
	return request(uploadFolderUrl, { ignoreCancellation: true, method: 'DELETE' }).catch(() => {});
}

export default async function writeNextcloudChunkedUpload(
	{ endpoint, username, request, stat, resolveMeta, proppatch }: NextcloudChunkedUploadOptions,
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
	const metaPromise = resolveMeta();

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
		const { headers: metaHeaders, meta } = await metaPromise;
		const { headers } = await request(uploadFileUrl, {
			headers: { Destination, ...metaHeaders },
			method: 'MOVE',
		});
		const etag = headers.etag ?? headers['oc-etag'];
		const [uid] = await Promise.all([
			etag
				? Promise.resolve(normalizeEtag(etag))
				: stat(key).then((newStat) => getFileUid(newStat, key)),
			meta ? proppatch(key, meta) : Promise.resolve(),
		]);
		return uid;
	} catch (error) {
		void deleteChunkUpload(request, uploadFolderUrl);
		throw error;
	}
}
