import type { Binary } from '@hesprs/sync-engine-sdk';
import { concatBinary } from '@repo/shared/binary';
import { encryptContentChunk } from './content';
import {
	CONTENT_CHUNK_SIZE,
	DECRYPTION_ERROR_MESSAGE,
	FILE_SALT_LENGTH,
	deriveFileKey,
	getEncryptedFileSize,
	importAesGcmKey,
} from './shared';

export default async function createEncryptedReadableStream(
	rootFileKey: Binary,
	source: ReadableStream<Binary>,
	rawFileSize: number,
): Promise<ReadableStream<Binary>> {
	const encryptedFileSize = getEncryptedFileSize(rawFileSize);
	const fileSalt = crypto.getRandomValues(new Uint8Array(FILE_SALT_LENGTH));
	const fileKey = await importAesGcmKey(
		await deriveFileKey(rootFileKey, fileSalt, encryptedFileSize),
	);

	let pending = new Uint8Array(0);
	let consumedRawBytes = 0;
	let chunkIndex = 0;

	return source.pipeThrough(
		new TransformStream<Binary, Binary>({
			async flush(controller) {
				if (consumedRawBytes !== rawFileSize) throw new Error(DECRYPTION_ERROR_MESSAGE);
				if (pending.byteLength > 0)
					controller.enqueue(await encryptContentChunk(fileKey, pending, chunkIndex));
			},
			start(controller) {
				controller.enqueue(fileSalt);
			},
			async transform(chunk, controller) {
				consumedRawBytes += chunk.byteLength;
				if (consumedRawBytes > rawFileSize) throw new Error(DECRYPTION_ERROR_MESSAGE);
				pending = concatBinary(pending, chunk);

				while (pending.byteLength >= CONTENT_CHUNK_SIZE) {
					const plainChunk = pending.slice(0, CONTENT_CHUNK_SIZE);
					pending = pending.slice(CONTENT_CHUNK_SIZE);
					controller.enqueue(await encryptContentChunk(fileKey, plainChunk, chunkIndex));
					chunkIndex += 1;
				}
			},
		}),
	);
}
