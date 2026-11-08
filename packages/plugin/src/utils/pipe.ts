import { STREAM_RESERVATION_SIZE } from '@/fs/wrappers/memory-control';
import { getStatus } from '@repo/shared/error';
import { Platform } from 'obsidian';
import type { Fs } from '@/fs';
import type { Binary, FileStat, MaybePromise } from '@/types';
import type { ErrorLike } from '@repo/shared/error';

export const REGRET_ERROR_MESSAGE = '=== Sync Engine Operation Regretted ===';
export const REGRET_ERROR = new Error(REGRET_ERROR_MESSAGE);

function getSizeCaps(): { streamThreshold: number; chunkSize: number; concurrency: number } {
	let size = 5 * 1024 ** 2; // 5 MiB
	if ('deviceMemory' in navigator && typeof navigator.deviceMemory === 'number') {
		if (navigator.deviceMemory <= 4) size /= 2;
	} else if (navigator.hardwareConcurrency <= 4) size /= 2;
	if (Platform.isAndroidApp) size /= 2;
	const chunkSize = size * 0.8;
	return {
		chunkSize,
		concurrency: Math.floor(STREAM_RESERVATION_SIZE / chunkSize),
		streamThreshold: size,
	};
}

const { chunkSize, concurrency, streamThreshold } = getSizeCaps();
export { chunkSize, concurrency };

export function pipe({ from, to, stat, key }: { from: Fs; to: Fs; key: string; stat: FileStat }) {
	return writeWithSize(to, key, readWithSize(from, key, stat), stat);
}

export async function readWithSize(fs: Fs, key: string, stat: FileStat) {
	try {
		if (stat.size >= streamThreshold) return await fs.readStream(key, stat);
		return await fs.read(key, stat);
	} catch (error) {
		if (isNonExistent(error)) throw REGRET_ERROR;
		throw error;
	}
}

export function writeWithSize(
	fs: Fs,
	key: string,
	value: MaybePromise<Binary | ReadableStream<Binary>>,
	stat: FileStat,
) {
	if (stat.size >= streamThreshold)
		return fs.writeStream(key, value as MaybePromise<ReadableStream<Binary>>, stat);
	return fs.write(key, value as MaybePromise<Binary>, stat);
}

// Swallow TOCTOU
function isNonExistent(error: unknown) {
	return (
		getStatus(error) === 404 ||
		(((error as ErrorLike).message as string) ?? String(error)).toUpperCase().includes('ENOENT')
	);
}
