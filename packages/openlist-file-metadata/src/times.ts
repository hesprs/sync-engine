import type { FileStat } from '@hesprs/sync-engine-sdk';

export type FileTimes = { mtime?: number; ctime?: number };
export type MetadataStat = FileStat & { openListFileTimes?: FileTimes };

export function timeValue(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 8.64e15) return;
	return Math.trunc(value);
}

export function readTimes(value: FileTimes): FileTimes {
	return { ctime: timeValue(value.ctime), mtime: timeValue(value.mtime) };
}

export function getTimes(stat: MetadataStat): FileTimes | undefined {
	return stat.openListFileTimes ? readTimes(stat.openListFileTimes) : undefined;
}

export function attachTimes(stat: FileStat, times: FileTimes): FileStat {
	return Object.assign(stat, { openListFileTimes: readTimes(times) });
}

export async function withTimes<T>(
	entries: Map<string, FileTimes>,
	key: string,
	times: FileTimes | undefined,
	action: () => T | Promise<T>,
): Promise<T> {
	if (!times) return action();
	if (entries.has(key)) throw new Error(`Concurrent writes to the same file: ${key}`);
	entries.set(key, times);
	try {
		return await action();
	} finally {
		entries.delete(key);
	}
}
