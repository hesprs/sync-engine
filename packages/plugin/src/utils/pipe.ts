import type { ErrorLike } from '@repo/shared/get-status';
import { getStatus } from '@repo/shared/get-status';
import { Platform } from 'obsidian';
import type { Fs } from '@/fs';
import type { Binary, FileStat } from '@/types';
import { STREAM_RESERVATION_SIZE } from '@/fs/wrappers/memory-control';

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

export async function pipe({
	from,
	to,
	stat,
	key,
}: {
	from: Fs;
	to: Fs;
	key: string;
	stat: FileStat;
}) {
	const value = await readWithSize(from, key, stat);
	if (!value) return;
	return writeWithValue(to, key, value, stat);
}

export async function readWithSize(fs: Fs, key: string, stat: FileStat) {
	try {
		if (stat.size > streamThreshold) return await fs.readStream(key, stat);
		return await fs.read(key, stat);
	} catch (error) {
		if (isNonExistent(error)) return;
		throw error;
	}
}

export function writeWithValue(
	fs: Fs,
	key: string,
	value: Binary | ReadableStream<Binary>,
	stat: FileStat,
) {
	if (value instanceof ReadableStream) return fs.writeStream(key, value, stat);
	return fs.write(key, value, stat);
}

// Swallow TOCTOU
function isNonExistent(error: unknown) {
	return (
		getStatus(error) === 404 ||
		(((error as ErrorLike).message as string) ?? String(error))
			.toLocaleUpperCase()
			.includes('ENOENT')
	);
}
