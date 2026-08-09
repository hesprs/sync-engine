import type { Binary, Request, Stat } from '@hesprs/sync-engine-sdk';
import { concatBinary } from '@repo/shared/binary';
import { buildUrl, getFileUid, getHeader } from './utils';
import { encodeURIComponent3986 } from '@repo/shared/path';

const NEXTCLOUD_CHUNK_SIZE = 5 * 1024 * 1024;
const NEXTCLOUD_MAX_CONCURRENT = 3;

type NextcloudChunkedUploadOptions = {
	auth: string;
	endpoint: string;
	request: Request;
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

async function deleteChunkUpload(request: Request, auth: string, uploadFolderUrl: string) {
	await request({
		headers: { Authorization: auth },
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
	const reader = value.getReader();
	const inFlight = new Set<Promise<void>>();
	let nextChunkNumber = 1;
	let pending = new Uint8Array(0);

	const trackUpload = (promise: Promise<void>) => {
		inFlight.add(promise);
		promise.then(
			() => inFlight.delete(promise),
			() => {},
		);
	};

	const waitForSlot = async () => {
		while (inFlight.size >= NEXTCLOUD_MAX_CONCURRENT) await Promise.race(inFlight);
	};

	const uploadChunk = async (chunkNumber: number, chunk: Binary) => {
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
	};

	const enqueueChunk = async (chunk: Binary) => {
		await waitForSlot();
		const chunkNumber = nextChunkNumber;
		nextChunkNumber += 1;
		trackUpload(uploadChunk(chunkNumber, chunk));
	};

	try {
		await options.request({
			headers: { Authorization: options.auth, Destination: destination },
			method: 'MKCOL',
			url: uploadFolderUrl,
		});

		while (true) {
			const { done, value: chunk } = await reader.read();
			if (done) break;
			pending = concatBinary(pending, chunk);
			while (pending.byteLength >= NEXTCLOUD_CHUNK_SIZE) {
				const upload = pending.slice(0, NEXTCLOUD_CHUNK_SIZE);
				pending = pending.slice(NEXTCLOUD_CHUNK_SIZE);
				await enqueueChunk(upload);
			}
		}

		if (pending.byteLength > 0) await enqueueChunk(pending);
		await Promise.all(inFlight);

		const response = await options.request({
			headers: { Authorization: options.auth, Destination: destination },
			method: 'MOVE',
			url: uploadFileUrl,
		});

		const etag = getHeader(response.headers, 'etag') ?? getHeader(response.headers, 'oc-etag');
		if (etag) return etag;
		return getFileUid(await options.stat(key), key);
	} catch (error) {
		await Promise.allSettled(inFlight);
		await deleteChunkUpload(options.request, options.auth, uploadFolderUrl);
		throw error;
	} finally {
		reader.releaseLock();
	}
}
