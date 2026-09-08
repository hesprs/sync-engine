import type { Binary } from '@hesprs/sync-engine-sdk';
import { concatBinary } from '@repo/shared/binary';
import {
	DECRYPTION_ERROR_MESSAGE,
	FILE_SALT_LENGTH,
	decryptContentChunk,
	deriveFileKey,
	getEncryptedChunkCount,
	getEncryptedChunkSize,
	importAesGcmKey,
} from './shared';

export default function createDecryptedReadableStream(
	source: ReadableStream<Binary>,
	rootFileKey: Binary,
	encryptedFileSize: number,
): ReadableStream<Binary> {
	let pending = new Uint8Array(0);
	let fileKeyPromise: Promise<CryptoKey> | undefined;
	let chunkIndex = 0;

	if (encryptedFileSize < FILE_SALT_LENGTH) throw new Error(DECRYPTION_ERROR_MESSAGE);

	const processPending = async (
		chunk: Binary,
		isFinal: boolean,
		controller: TransformStreamDefaultController<Binary>,
	): Promise<void> => {
		pending = concatBinary(pending, chunk);

		const totalChunkCount = getEncryptedChunkCount(encryptedFileSize);

		if (!fileKeyPromise) {
			if (pending.byteLength < FILE_SALT_LENGTH) {
				if (isFinal) throw new Error(DECRYPTION_ERROR_MESSAGE);
				return;
			}

			const fileSalt = pending.slice(0, FILE_SALT_LENGTH);
			pending = pending.slice(FILE_SALT_LENGTH);
			fileKeyPromise = importAesGcmKey(
				await deriveFileKey(rootFileKey, fileSalt, encryptedFileSize),
			);
		}

		while (chunkIndex < totalChunkCount) {
			const expectedSize = getEncryptedChunkSize(chunkIndex, encryptedFileSize);
			if (pending.byteLength < expectedSize) break;

			const encryptedChunk = pending.slice(0, expectedSize);
			pending = pending.slice(expectedSize);
			controller.enqueue(
				await decryptContentChunk(await fileKeyPromise, encryptedChunk, chunkIndex),
			);
			chunkIndex += 1;
		}

		if (isFinal && (chunkIndex !== totalChunkCount || pending.byteLength > 0))
			throw new Error(DECRYPTION_ERROR_MESSAGE);
	};

	return source.pipeThrough(
		new TransformStream<Binary, Binary>({
			async flush(controller) {
				await processPending(new Uint8Array(0), true, controller);
			},
			async transform(chunk, controller) {
				await processPending(chunk, false, controller);
			},
		}),
	);
}
