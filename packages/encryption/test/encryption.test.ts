import type { Binary, FileStat, Fs } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { beforeEach, expect, test } from 'bun:test';
import { openMemoryDB } from 'uni-kv';
import type { EncryptionDBMeta, EncryptionDBSchema } from '@/wrapper';
import encryptionWrapper from '@/wrapper';

const { bytes, file, fs: testFs, stream } = testKit;
const PASSWORD = 'password';
const WRONG_PASSWORD = 'wrong-password';
const DECRYPTION_ERROR_MESSAGE = 'data corrupted or wrong password';

const memoryDB = openMemoryDB<EncryptionDBSchema, EncryptionDBMeta>('encryption-wrapper-test');

beforeEach(() => {
	memoryDB.clearStores();
	memoryDB.setMeta('encryptionKeys', undefined);
	memoryDB.setMeta('encryptionMarker', undefined);
});

function must<T>(value: T | undefined, message: string): T {
	if (value === undefined) throw new Error(message);
	return value;
}

async function collectStream(value: ReadableStream<Binary>): Promise<Binary> {
	const reader = value.getReader();
	const chunks: Array<Binary> = [];
	let total = 0;
	try {
		while (true) {
			const { done, value: chunk } = await reader.read();
			if (done) break;
			chunks.push(chunk);
			total += chunk.byteLength;
		}
	} finally {
		reader.releaseLock();
	}
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

function splitBinary(source: Binary, sizes: Array<number>) {
	const chunks: Array<Binary> = [];
	let offset = 0;
	for (const size of sizes) {
		if (offset >= source.byteLength) break;
		const end = Math.min(source.byteLength, offset + size);
		chunks.push(source.slice(offset, end));
		offset = end;
	}
	if (offset < source.byteLength) chunks.push(source.slice(offset));
	return chunks;
}

function joinBinary(chunks: Array<Binary>) {
	const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

function createRemote(options: { uid?: string } = {}) {
	const files = new Map<string, Binary>();
	const directories = new Set<string>(['/']);
	const forwardedSizes: Array<number | undefined> = [];
	const writeStreamChunks: Array<Binary> = [];
	const base = testFs({
		control: {
			delete(key) {
				files.delete(key);
				directories.delete(key);
			},
			exists(key) {
				return files.has(key) || directories.has(key);
			},
			list() {
				return [];
			},
			mkdir(key) {
				directories.add(key);
			},
			move(oldKey, newKey) {
				const stored = files.get(oldKey);
				if (stored !== undefined) {
					files.set(newKey, stored);
					files.delete(oldKey);
				}
				if (directories.has(oldKey)) {
					directories.add(newKey);
					directories.delete(oldKey);
				}
			},
			read(key) {
				return files.get(key) ?? new Uint8Array(0);
			},
			readStream(key) {
				return stream([files.get(key) ?? new Uint8Array(0)]);
			},
			stat(key) {
				if (directories.has(key) || key.endsWith('/')) return { isDir: true, key };
				const value = files.get(key) ?? new Uint8Array(0);
				return { isDir: false, key, mtime: 1, size: value.byteLength, uid: `${key}-uid` };
			},
			write(key, value) {
				files.set(key, value);
				return key;
			},
			async writeStream(key, value) {
				const reader = value.getReader();
				const chunks: Array<Binary> = [];
				try {
					while (true) {
						const { done, value: chunk } = await reader.read();
						if (done) break;
						writeStreamChunks.push(chunk);
						chunks.push(chunk);
					}
				} finally {
					reader.releaseLock();
				}
				const collected = joinBinary(chunks);
				files.set(key, collected);
				return key;
			},
		},
		uid: options.uid ?? 'uid',
	});
	const fs = {
		...base.fs,
		writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
			forwardedSizes.push(stat.size);
			return base.fs.writeStream(key, value, stat);
		},
	} as Fs;
	return { base, files, forwardedSizes, fs, writeStreamChunks };
}

test('write and read round trip content', async () => {
	const remote = createRemote();
	const shim = encryptionWrapper(remote.fs, { memoryDB, password: PASSWORD });
	const plaintext = bytes('hello world');
	const stat = file('Folder/file.md', { size: plaintext.byteLength });

	await shim.write('Folder/file.md', plaintext, stat);

	expect(await shim.read('Folder/file.md', stat)).toStrictEqual(plaintext);
});

test('moved encrypted content remains decryptable', async () => {
	const remote = createRemote();
	const shim = encryptionWrapper(remote.fs, { memoryDB, password: PASSWORD });
	const plaintext = bytes('content survives a move');

	await shim.write(
		'Folder/file.md',
		plaintext,
		file('Folder/file.md', { size: plaintext.byteLength }),
	);
	await shim.move('Folder/file.md', 'Moved/file.md');

	expect(
		await shim.read('Moved/file.md', file('Moved/file.md', { size: plaintext.byteLength })),
	).toStrictEqual(plaintext);
});

test('readStream decrypts with provided size', async () => {
	const remote = createRemote();
	const shim = encryptionWrapper(remote.fs, { memoryDB, password: PASSWORD });
	const plaintext = bytes('stream data'.repeat(20_000));
	const writeStat = file('Folder/file.md', { size: plaintext.byteLength });

	await shim.write('Folder/file.md', plaintext, writeStat);
	const encryptedKey = must(remote.base.calls.write[0]?.[0], 'missing encrypted key');
	const encrypted = must(remote.files.get(encryptedKey), 'missing encrypted payload');
	remote.base.control.readStream = () => stream(splitBinary(encrypted, [1, 7, 3, 64, 4096]));

	expect(remote.base.calls.stat).toStrictEqual([]);
	const readStat = file('Folder/file.md', { size: encrypted.byteLength });
	expect(await collectStream(await shim.readStream('Folder/file.md', readStat))).toStrictEqual(
		plaintext,
	);
});

test('readStream handles arbitrary source boundaries', async () => {
	const remote = createRemote();
	const shim = encryptionWrapper(remote.fs, { memoryDB, password: PASSWORD });
	const plaintext = new Uint8Array(300_000).fill(7);
	const writeStat = file('Folder/file.md', { size: plaintext.byteLength });

	await shim.write('Folder/file.md', plaintext, writeStat);
	const encryptedKey = must(remote.base.calls.write[0]?.[0], 'missing encrypted key');
	const encrypted = must(remote.files.get(encryptedKey), 'missing encrypted payload');
	remote.base.control.readStream = () =>
		stream(splitBinary(encrypted, [1, 7, 3, 4096, 11, 8192]));

	const readStat = file('Folder/file.md', { size: encrypted.byteLength });
	expect(await collectStream(await shim.readStream('Folder/file.md', readStat))).toStrictEqual(
		plaintext,
	);
});

test('writeStream encrypts round trip and forwards encrypted size', async () => {
	const remote = createRemote();
	const shim = encryptionWrapper(remote.fs, { memoryDB, password: PASSWORD });
	const plaintext = bytes('chunked write stream '.repeat(12_000));
	const writeStat = file('Folder/file.md', { size: plaintext.byteLength });

	await shim.writeStream(
		'Folder/file.md',
		stream(splitBinary(plaintext, [1, 5, 3, 4096, 7])),
		writeStat,
	);

	const encryptedKey = must(remote.base.calls.writeStream[0]?.[0], 'missing encrypted key');
	const encrypted = must(remote.files.get(encryptedKey), 'missing encrypted payload');
	expect(remote.forwardedSizes[0]).toBe(encrypted.byteLength);
	expect(remote.writeStreamChunks.length).toBeGreaterThan(1);
	expect(await shim.read('Folder/file.md', writeStat)).toStrictEqual(plaintext);
});

test('stat and list preserve metadata while decrypting keys', async () => {
	const remote = createRemote();
	const shim = encryptionWrapper(remote.fs, { memoryDB, password: PASSWORD });
	remote.base.control.stat = (key) => ({
		isDir: false,
		key,
		mtime: 1234,
		size: 567,
		uid: 'etag-1',
	});
	await shim.mkdir('Folder/folder/');
	await shim.write('Folder/file.md', bytes('x'), file('Folder/file.md', { size: 1 }));
	const folderKey = must(remote.base.calls.mkdir[0], 'missing encrypted folder key');
	const fileKey = must(remote.base.calls.write[0]?.[0], 'missing encrypted file key');
	remote.base.control.list = () => [
		{ isDir: true, key: folderKey },
		{ isDir: false, key: fileKey, mtime: 12, size: 7, uid: 'note-2' },
	];

	const stat = await shim.stat('Folder/file.md');
	const list = await shim.list('Folder/', () => 'include');

	expect(stat).toMatchObject({ isDir: false, mtime: 1234, size: 567, uid: 'etag-1' });
	expect(stat.key).toBe('Folder/file.md');
	expect(list).toStrictEqual([
		{ isDir: true, key: 'Folder/folder/' },
		{ isDir: false, key: 'Folder/file.md', mtime: 12, size: 7, uid: 'note-2' },
	]);
});

test('exists delete mkdir and move rewrite keys', async () => {
	const remote = createRemote();
	const shim = encryptionWrapper(remote.fs, { memoryDB, password: PASSWORD });
	const calls: Array<[string, string?]> = [];
	remote.base.control.exists = (key) => {
		calls.push([key]);
		return true;
	};
	remote.base.control.delete = (key) => {
		calls.push([key]);
	};
	remote.base.control.mkdir = (key) => {
		calls.push([key]);
	};
	remote.base.control.move = (oldKey, newKey) => {
		calls.push([oldKey, newKey]);
	};

	await shim.exists('Folder/Sub/');
	await shim.delete('Folder/Sub/');
	await shim.mkdir('Folder/Sub/');
	await shim.move('Folder/Sub/', 'Folder/Next/');

	expect(calls[0]?.[0]).toBe(calls[1]?.[0]);
	expect(calls[1]?.[0]).toBe(calls[2]?.[0]);
	expect(calls[3]?.[0]).not.toBe('Folder/Sub/');
	expect(calls[3]?.[1]).not.toBe('Folder/Next/');
});

test('same credentials keep deterministic encrypted paths', async () => {
	const first = createRemote({ uid: 'uid-a' });
	const second = createRemote({ uid: 'uid-a' });
	const firstShim = encryptionWrapper(first.fs, { memoryDB, password: PASSWORD });
	const secondShim = encryptionWrapper(second.fs, { memoryDB, password: PASSWORD });

	await firstShim.exists('Folder/file.md');
	await secondShim.exists('Folder/file.md');

	expect(first.base.calls.exists[0]).toBe(second.base.calls.exists[0]);
});

test('uid change resets persistent path cache', async () => {
	const first = createRemote({ uid: 'uid-a' });
	const firstShim = encryptionWrapper(first.fs, { memoryDB, password: PASSWORD });

	await firstShim.exists('Folder/file.md');

	const second = createRemote({ uid: 'uid-b' });
	const secondShim = encryptionWrapper(second.fs, { memoryDB, password: PASSWORD });

	expect(memoryDB.getMeta('encryptionMarker')).toBe('uid-b~password');
	expect(memoryDB.getMeta('encryptionKeys')).toBeUndefined();
	expect(memoryDB.getStore('decryptedToEncrypted').keys()).toStrictEqual([]);
	expect(memoryDB.getStore('encryptedToDecrypted').keys()).toStrictEqual([]);

	await secondShim.exists('Folder/file.md');
});

test('password change resets persistent path cache', async () => {
	const first = createRemote({ uid: 'uid-a' });
	const firstShim = encryptionWrapper(first.fs, { memoryDB, password: PASSWORD });

	await firstShim.exists('Folder/file.md');

	const second = createRemote({ uid: 'uid-a' });
	const secondShim = encryptionWrapper(second.fs, { memoryDB, password: WRONG_PASSWORD });

	expect(memoryDB.getMeta('encryptionMarker')).toBe('uid-a~wrong-password');
	expect(memoryDB.getMeta('encryptionKeys')).toBeUndefined();
	expect(memoryDB.getStore('decryptedToEncrypted').keys()).toStrictEqual([]);
	expect(memoryDB.getStore('encryptedToDecrypted').keys()).toStrictEqual([]);

	await secondShim.exists('Folder/file.md');
});

test('wrong password and malformed content fail to decrypt', async () => {
	const good = createRemote();
	const goodShim = encryptionWrapper(good.fs, { memoryDB, password: PASSWORD });
	const plaintext = bytes('secret payload');
	const stat = file('Folder/file.md', { size: plaintext.byteLength });
	await goodShim.write('Folder/file.md', plaintext, stat);
	const encryptedKey = must(good.base.calls.write[0]?.[0], 'missing encrypted key');
	const encrypted = must(good.files.get(encryptedKey), 'missing encrypted payload');

	const wrong = createRemote();
	const wrongShim = encryptionWrapper(wrong.fs, { memoryDB, password: WRONG_PASSWORD });
	wrong.base.control.read = () => encrypted;
	wrong.base.control.stat = (key) => ({
		isDir: false,
		key,
		mtime: 1,
		size: encrypted.byteLength,
		uid: 'uid',
	});

	expect(wrongShim.read('Folder/file.md', stat)).rejects.toThrow(DECRYPTION_ERROR_MESSAGE);
	wrong.base.control.read = () => new Uint8Array(1);
	expect(wrongShim.read('Folder/file.md', stat)).rejects.toThrow(DECRYPTION_ERROR_MESSAGE);
});

test('zero byte content round trips', async () => {
	const remote = createRemote();
	const shim = encryptionWrapper(remote.fs, { memoryDB, password: PASSWORD });
	const empty = new Uint8Array(0);
	const emptyStat = file('Folder/empty.md', { size: 0 });

	await shim.write('Folder/empty.md', empty, emptyStat);
	await shim.writeStream('Folder/empty-stream.md', stream(), emptyStat);

	expect(await shim.read('Folder/empty.md', emptyStat)).toStrictEqual(empty);
	const streamStat = file('Folder/empty-stream.md', { size: 16 });
	expect(
		await collectStream(await shim.readStream('Folder/empty-stream.md', streamStat)),
	).toStrictEqual(empty);
});
