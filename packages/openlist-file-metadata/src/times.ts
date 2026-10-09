import type { FileStat, Stat } from '@hesprs/sync-engine-sdk';

export type FileTimes = { mtime?: number; ctime?: number };
export type DownloadMeta = { get: () => Dict<string> | undefined; mtime?: number };
const fileTimes = Symbol('OpenList file times');
const downloadMeta = Symbol('OpenList download metadata');
type TransferStat = FileStat & { [fileTimes]?: FileTimes; [downloadMeta]?: DownloadMeta };

export function attachTimes(stat: FileStat, times: FileTimes): FileStat {
	// Enumerable symbol properties survive stat copies without entering meta().
	const source: TransferStat = { ...stat, [fileTimes]: times };
	return source;
}

export function getTimes(stat: FileStat): FileTimes | undefined {
	return (stat as TransferStat)[fileTimes];
}

export function attachDownloadMeta(stat: FileStat, meta: DownloadMeta): FileStat {
	return { ...stat, [downloadMeta]: meta } as TransferStat;
}

export function getDownloadMeta(stat: FileStat): DownloadMeta | undefined {
	return (stat as TransferStat)[downloadMeta];
}

export function timeValue(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 8.64e15) return;
	return Math.trunc(value);
}

export function metadataTime(
	value: string | undefined,
	unit: 'seconds' | 'milliseconds',
): number | undefined {
	const text = value?.trim();
	if (!text) return;
	if (/^-?\d+(?:\.\d+)?$/u.test(text)) {
		if (unit === 'milliseconds') return timeValue(Number(text));
		const [seconds, fraction = ''] = text.split('.');
		const sign = text.startsWith('-') ? -1 : 1;
		return timeValue(
			Number(seconds) * 1000 + sign * Number(fraction.slice(0, 3).padEnd(3, '0')),
		);
	}
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(text)) return;
	const time = timeValue(Date.parse(text));
	if (time === undefined) return;
	const zone = text.slice(-6);
	const offset = text.endsWith('Z')
		? 0
		: (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4))) * (zone.startsWith('-') ? -1 : 1);
	// Date.parse can normalize impossible dates, such as February 30.
	if (new Date(time + offset * 60_000).toISOString().slice(0, 19) === text.slice(0, 19))
		return time;
}

export function isEncryptedTime(value = ''): boolean {
	if (value.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) return false;
	try {
		// The SDK's AES-GCM metadata contains a 12-byte nonce and a 16-byte tag.
		return atob(value).length >= 28;
	} catch {
		return false;
	}
}

export function readTimes(value: { ctime?: string; mtime?: string }): FileTimes {
	return {
		ctime: value.ctime?.trim() ? timeValue(Number(value.ctime)) : undefined,
		mtime: value.mtime?.trim() ? timeValue(Number(value.mtime)) : undefined,
	};
}

export function cacheMeta(getMeta: Stat['meta']): () => Promise<Dict<string>> {
	let result: Promise<Dict<string>> | undefined;
	return () => (result ??= Promise.resolve().then(getMeta));
}

export async function withTimes<T>(
	entries: Map<string, FileTimes>,
	key: string,
	times: FileTimes,
	action: () => T | Promise<T>,
): Promise<T> {
	if (entries.has(key)) throw new Error(`Concurrent writes to the same file: ${key}`);
	entries.set(key, times);
	try {
		return await action();
	} finally {
		entries.delete(key);
	}
}
