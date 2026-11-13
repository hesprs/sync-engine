import { createCipher, createHistoryCipher } from '@/crypto';
import { buildCommitLog } from '@/head-log';
import { openRemoteHistory } from '@/remote';
import { expect, test } from 'bun:test';
import type { RemoteHistory } from '@/remote';
import type { Binary, FileStat, FolderStat, Fs, ListReporter, Stat } from '@hesprs/sync-engine-sdk';
import type { App } from 'obsidian';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function mustRemote(
	fs: Fs,
	namespace: string | Error,
	deviceId: string,
	cipher?: Awaited<ReturnType<typeof createCipher>>,
): RemoteHistory {
	const remote = openRemoteHistory(fs, namespace, deviceId, cipher);
	if (!remote) throw new Error('expected a remote history handle');
	return remote;
}

function fakeApp(secrets: Record<string, string>): App {
	return { secretStorage: { getSecret: (id: string) => secrets[id] } } as unknown as App;
}

test('a cipher round-trips bytes and the ciphertext does not contain plaintext', async () => {
	const cipher = await createCipher('correct horse battery staple');
	const plaintext = encoder.encode('# Secret note\nprivate content');
	const encrypted = await cipher.encrypt(plaintext);
	expect(decoder.decode(encrypted)).not.toContain('private content');
	expect(await cipher.decrypt(encrypted)).toStrictEqual(plaintext);
});

test('decrypting unencrypted data (no magic) throws an error', async () => {
	const cipher = await createCipher('pw');
	const plaintext = encoder.encode('plaintext without magic');
	expect(cipher.decrypt(plaintext)).rejects.toThrow('missing encryption magic');
});

test('a wrong password fails loudly instead of producing garbage', async () => {
	const cipher = await createCipher('password-a');
	const other = await createCipher('password-b');
	const encrypted = await cipher.encrypt(encoder.encode('secret'));
	let message = '';
	try {
		await other.decrypt(encrypted);
	} catch (error) {
		message = (error as Error).message;
	}
	expect(message).toContain('password changed');
});

test('encryption off yields no cipher; on with a password yields a cipher', async () => {
	expect(
		await createHistoryCipher({ encryption: { enabled: false } }, fakeApp({})),
	).toBeUndefined();
	const modules = { encryption: { enabled: true, password: 'secret-id' } };
	const cipher = await createHistoryCipher(modules, fakeApp({ 'secret-id': 'pw' }));
	expect(cipher).toBeDefined();
});

test('encryption on without a password throws rather than writing plaintext', async () => {
	const modules = { encryption: { enabled: true, password: 'missing' } };
	let threw = false;
	try {
		await createHistoryCipher(modules, fakeApp({}));
	} catch {
		threw = true;
	}
	expect(threw).toBe(true);
});

/** Minimal in-memory RootFs: enough for digOriginal + prefixWrapper + read/write/list. */
function fakeFs() {
	const store = new Map<string, Uint8Array>();
	const listStats = (key: string): Array<Stat> =>
		[...store.entries()]
			.filter(([name]) => name.startsWith(key))
			.map(([name, value]) => ({
				isDir: false as const,
				key: name,
				meta: () => ({}),
				mtime: 0,
				size: value.byteLength,
				uid: 'u',
			}));
	const fs: Fs = {
		delete(key) {
			store.delete(key);
			return Promise.resolve();
		},
		exists: (key) => Promise.resolve(store.has(key)),
		getUid: () => 'root',
		list: (key: string, _reporter: ListReporter) => Promise.resolve(listStats(key)),
		mkdir: (_key: string, _stat: FolderStat) => Promise.resolve(),
		move(oldKey, newKey) {
			const value = store.get(oldKey);
			if (value) {
				store.set(newKey, value);
				store.delete(oldKey);
			}
			return Promise.resolve();
		},
		read: (key: string) => Promise.resolve((store.get(key) ?? new Uint8Array()) as Binary),
		readStream(key: string) {
			return Promise.resolve(
				new ReadableStream({
					start(controller) {
						controller.enqueue((store.get(key) ?? new Uint8Array()) as Binary);
						controller.close();
					},
				}),
			);
		},
		stat: (key: string): Promise<FileStat> => {
			const value = store.get(key);
			if (!value) return Promise.reject(new Error(`missing ${key}`));
			return Promise.resolve({
				isDir: false,
				key,
				meta: () => ({}),
				mtime: 0,
				size: value.byteLength,
				uid: 'u',
			});
		},
		write: async (key: string, value) => {
			store.set(key, new Uint8Array(await value));
			return 'uid';
		},
		async writeStream(key: string, value) {
			const reader = (await value).getReader();
			const parts: Array<Uint8Array> = [];
			for (;;) {
				const { done, value: chunk } = await reader.read();
				if (done) break;
				parts.push(chunk);
			}
			let total = 0;
			for (const part of parts) total += part.byteLength;
			const joined = new Uint8Array(total);
			let offset = 0;
			for (const part of parts) {
				joined.set(part, offset);
				offset += part.byteLength;
			}
			store.set(key, joined);
			return 'uid';
		},
	};
	return { fs, store };
}

test('without a cipher the remote handle writes plaintext (backward compatible)', async () => {
	const { fs, store } = fakeFs();
	const remote = mustRemote(fs, 'ns', 'device-a');
	await remote.putBlob('hash1', encoder.encode('plaintext blob'));
	const stored = [...store.values()][0];
	expect(decoder.decode(stored)).toContain('plaintext blob');
});

test('with a cipher the stored object is encrypted but reads back as plaintext', async () => {
	const { fs, store } = fakeFs();
	const cipher = await createCipher('pw');
	const remote = mustRemote(fs, 'ns', 'device-a', cipher);
	const blob = encoder.encode('secret attachment content');
	await remote.putBlob('hash2', blob);
	const stored = [...store.values()][0];
	expect(decoder.decode(stored)).not.toContain('secret attachment content');
	expect(await remote.getObject('ns/blobs/hash2.blob')).toStrictEqual(blob);
});

test('head logs survive encryption (write then read)', async () => {
	const { fs } = fakeFs();
	const cipher = await createCipher('pw');
	const remote = mustRemote(fs, 'ns', 'device-a', cipher);
	const log = await buildCommitLog({
		chunkIndex: {},
		deviceId: 'device-a',
		generation: 1,
		heads: ['note.md@1'],
		ns: 'ns',
		packs: [],
		peakLamport: 1,
		seq: 1,
		updatedAt: 1000,
	});
	await remote.writeHead(log);
	expect(await remote.readHead('device-a')).toStrictEqual(log);
});
