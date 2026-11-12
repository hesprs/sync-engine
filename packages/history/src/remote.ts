import { decodeHeadLog, encodeHeadLog } from '@/head-log';
import { packFileName } from '@/pack';
import { digOriginal, prefixWrapper, writeWithSize } from '@hesprs/sync-engine-sdk';
import type { HistoryCipher } from '@/crypto';
import type { CommitLog } from '@/types';
import type { Binary, FileStat, Fs, ListOptions, Stat } from '@hesprs/sync-engine-sdk';

const HISTORY_PREFIX = '.sync-engine-history/';

export type RemoteHistory = {
	fs: Fs;
	ns: string;
	deviceId: string;
	putPack: (seq: number, hash: string, bytes: Uint8Array) => Promise<void>;
	putBlob: (hash: string, bytes: Uint8Array) => Promise<void>;
	getObject: (key: string) => Promise<Uint8Array>;
	readHead: (deviceId: string) => Promise<CommitLog | undefined>;
	writeHead: (log: CommitLog) => Promise<void>;
	listHeads: () => Promise<Array<string>>;
	listPacks: (deviceId: string) => Promise<Array<string>>;
	deletePack: (deviceId: string, fileName: string) => Promise<void>;
};

function fileStat(key: string, size: number, mtime = Date.now()): FileStat {
	return { isDir: false, key, meta: () => ({}), mtime, size, uid: `history-${mtime}` };
}

const includeAll = (): ListOptions => 'include';

function remotePath(ns: string, ...parts: Array<string>): string {
	return [ns, ...parts].join('/');
}

export function headKey(ns: string, deviceId: string): string {
	return remotePath(ns, 'heads', `${deviceId}.log`);
}

export function packKey(ns: string, deviceId: string, fileName: string): string {
	return remotePath(ns, 'packs', deviceId, fileName);
}

export function blobKey(ns: string, hash: string): string {
	return remotePath(ns, 'blobs', `${hash}.blob`);
}

/**
 * Builds a dedicated history handle from the run's remoteFs. digOriginal walks past every sync
 * wrapper, so history never pollutes the sync core's remote snapshot. When encryption is active,
 * object contents are AES-GCM encrypted here at the PUT/GET boundary while remote object names stay
 * literal (content hashes), preserving self-certifying names, dedup and orphan discovery.
 */
export function openRemoteHistory(
	remoteFs: Fs,
	namespace: string | Error,
	deviceId: string,
	cipher?: HistoryCipher,
): RemoteHistory | undefined {
	if (namespace instanceof Error || namespace === '') return undefined;
	const fs = prefixWrapper(digOriginal(remoteFs), HISTORY_PREFIX);
	const ns = namespace;

	/** Writes bytes, encrypting at rest when a cipher is active. */
	async function put(key: string, bytes: Uint8Array): Promise<void> {
		const payload = cipher ? await cipher.encrypt(bytes) : bytes;
		await writeWithSize(fs, key, payload as Binary, fileStat(key, payload.byteLength));
	}

	/**
	 * Reads raw (possibly encrypted) bytes, without decrypting. History always decodes a whole
	 * object in memory, so a single full read is used instead of the size-based streaming path:
	 * ranged streams are unreliable on Android and would only be buffered here anyway.
	 */
	async function readBytes(key: string): Promise<Uint8Array> {
		const stat = await fs.stat(key);
		if (stat.isDir) throw new Error(`Expected a file at ${key}`);
		return fs.read(key, stat);
	}

	async function get(key: string): Promise<Uint8Array> {
		const raw = await readBytes(key);
		return cipher ? cipher.decrypt(raw) : raw;
	}

	async function listHeadIds(): Promise<Array<string>> {
		const stats: Array<Stat> = await fs.list(remotePath(ns, 'heads'), includeAll);
		return stats
			.filter((stat) => !stat.isDir && stat.key.endsWith('.log'))
			.map((stat) => (stat.key.split('/').at(-1) ?? stat.key).slice(0, -4));
	}

	async function listPackNames(packDeviceId: string): Promise<Array<string>> {
		// Object stores have no real folder object, so exists(folder) is unreliable. List directly
		// and treat a missing folder as an empty set.
		let stats: Array<Stat>;
		try {
			stats = await fs.list(remotePath(ns, 'packs', packDeviceId), includeAll);
		} catch {
			return [];
		}
		return stats
			.filter((stat) => !stat.isDir && stat.key.endsWith('.pack'))
			.map((stat) => stat.key.split('/').at(-1) ?? stat.key);
	}

	return {
		async deletePack(packDeviceId, fileName) {
			await fs.delete(packKey(ns, packDeviceId, fileName));
		},
		deviceId,
		fs,
		getObject: get,
		listHeads: listHeadIds,
		listPacks: listPackNames,
		ns,
		async putBlob(hash, bytes) {
			await put(blobKey(ns, hash), bytes);
		},
		async putPack(seq, hash, bytes) {
			await put(packKey(ns, deviceId, packFileName(deviceId, seq, hash)), bytes);
		},
		async readHead(headDeviceId) {
			const key = headKey(ns, headDeviceId);
			if (!(await fs.exists(key))) return;
			return decodeHeadLog(await get(key));
		},
		async writeHead(log) {
			await put(headKey(ns, log.deviceId), encodeHeadLog(log));
		},
	};
}
