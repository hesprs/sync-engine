import {
	DECRYPTION_ERROR_MESSAGE,
	FILE_SALT_LENGTH,
	decryptContentChunk,
	deriveFileKey,
	getEncryptedChunkCount,
	getEncryptedChunkSize,
	importAesGcmKey,
} from './shared';
import { PartBuffer } from '@repo/shared/binary';
import type { Binary } from '@hesprs/sync-engine-sdk';

export default function createDecryptedReadableStream(
	source: ReadableStream<Binary>,
	rootFileKey: Binary,
	encryptedFileSize: number,
): ReadableStream<Binary> {
	const pending = new PartBuffer();
	let fileKeyPromise: Promise<CryptoKey> | undefined;
	let chunkIndex = 0;

	if (encryptedFileSize < FILE_SALT_LENGTH) throw new Error(DECRYPTION_ERROR_MESSAGE);

	const processPending = async (
		chunk: Binary,
		isFinal: boolean,
		controller: TransformStreamDefaultController<Binary>,
	): Promise<void> => {
		pending.push(chunk);

		const totalChunkCount = getEncryptedChunkCount(encryptedFileSize);

		if (!fileKeyPromise) {
			if (pending.size < FILE_SALT_LENGTH) {
				if (isFinal) throw new Error(DECRYPTION_ERROR_MESSAGE);
				return;
			}

			fileKeyPromise = importAesGcmKey(
				await deriveFileKey(
					rootFileKey,
					pending.slice(FILE_SALT_LENGTH),
					encryptedFileSize,
				),
			);
		}

		while (chunkIndex < totalChunkCount) {
			const expectedSize = getEncryptedChunkSize(chunkIndex, encryptedFileSize);
			if (pending.size < expectedSize) break;

			const encryptedChunk = pending.slice(expectedSize);
			controller.enqueue(
				await decryptContentChunk(await fileKeyPromise, encryptedChunk, chunkIndex),
			);
			chunkIndex += 1;
		}

		if (isFinal && (chunkIndex !== totalChunkCount || pending.size > 0))
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
