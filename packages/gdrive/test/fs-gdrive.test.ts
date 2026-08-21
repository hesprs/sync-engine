import type { Binary, ListReporter, RootFs, Stat } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import { md5 } from 'hash-wasm';
import checkConnection from '@/gdrive/check-connection';
import GdriveFs from '@/gdrive/fs';
import { RESUMABLE_CHUNK_SIZE } from '@/gdrive/upload';
import { MockDrive, jsonResponse } from './mock-drive';

const { bytes, file, stream: createStream } = testKit;

const includeAll: ListReporter = () => 'advance';

function createFs(options: { baseDirectory?: string; useTrash?: boolean } = {}) {
	const drive = new MockDrive();
	const fs: RootFs = new GdriveFs({
		account: 'mock@example.com',
		baseDirectory: options.baseDirectory ?? 'Vault/Notes/',
		request: drive.request,
		useTrash: options.useTrash ?? true,
	});
	return { drive, fs };
}

async function collect(source: ReadableStream<Binary>): Promise<string> {
	const reader = source.getReader();
	const chunks: Array<Binary> = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
	}
	reader.releaseLock();
	let total = 0;
	for (const chunk of chunks) total += chunk.byteLength;
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(merged);
}

test('write creates the base directory chain and read round-trips content', async () => {
	const { drive, fs } = createFs();
	const mtime = 1_700_000_000_000;
	const uid = await fs.write('a.md', bytes('hello'), file('a.md', { mtime, size: 5 }));
	expect(uid).toBe(await md5('hello'));
	expect(drive.contentByPath('Vault/Notes/a.md')).toBe('hello');
	expect(drive.fileByPath('Vault/Notes/a.md')?.modifiedTime).toBe(new Date(mtime).toISOString());
	expect(new TextDecoder().decode(await fs.read('a.md', file('a.md')))).toBe('hello');
});

test('write to an existing key updates the same Drive file in place', async () => {
	const { drive, fs } = createFs();
	await fs.write('note.md', bytes('one'), file('note.md', { mtime: 1000, size: 3 }));
	const firstId = drive.fileByPath('Vault/Notes/note.md')?.id;
	await fs.write('note.md', bytes('two!'), file('note.md', { mtime: 2000, size: 4 }));
	const updated = drive.fileByPath('Vault/Notes/note.md');
	expect(updated?.id).toBe(firstId ?? '');
	expect(drive.contentByPath('Vault/Notes/note.md')).toBe('two!');
	expect(updated?.modifiedTime).toBe(new Date(2000).toISOString());
});

test('keys with apostrophes survive the query escaping round trip', async () => {
	const { drive, fs } = createFs();
	await fs.write("it's ok.md", bytes('quoted'), file("it's ok.md", { size: 6 }));
	expect(drive.contentByPath("Vault/Notes/it's ok.md")).toBe('quoted');
	expect(new TextDecoder().decode(await fs.read("it's ok.md", file("it's ok.md")))).toBe(
		'quoted',
	);
});

test('mkdir builds nested folders and stat and exists see them', async () => {
	const { drive, fs } = createFs();
	await fs.mkdir('x/y/', true);
	expect(drive.fileByPath('Vault/Notes/x/y')?.mimeType).toBe(
		'application/vnd.google-apps.folder',
	);
	expect(await fs.stat('x/y/')).toStrictEqual({ isDir: true, key: 'x/y/' });
	expect(await fs.exists('x/')).toBe(true);
	expect(await fs.exists('missing/')).toBe(false);
	expect(await fs.exists('missing.md')).toBe(false);
	await expect(fs.stat('missing.md')).rejects.toMatchObject({ status: 404 });
	await fs.mkdir('x/y/', true); // Idempotent
	expect(await fs.exists('x/y/')).toBe(true);
});

test('stat returns md5 uid, size, and preserved mtime for files', async () => {
	const { fs } = createFs();
	const mtime = 1_600_000_000_000;
	await fs.write('s.md', bytes('stats'), file('s.md', { mtime, size: 5 }));
	const stat = await fs.stat('s.md');
	expect(stat).toStrictEqual({
		isDir: false,
		key: 's.md',
		mtime,
		size: 5,
		uid: await md5('stats'),
	});
});

test('list walks the tree, honors reporter verdicts, and paginates', async () => {
	const { fs } = createFs();
	await fs.write('a.md', bytes('a'), file('a.md', { size: 1 }));
	await fs.write('excluded.md', bytes('x'), file('excluded.md', { size: 1 }));
	await fs.write('sub/b.md', bytes('b'), file('sub/b.md', { size: 1 }));
	await fs.write('skip/c.md', bytes('c'), file('skip/c.md', { size: 1 }));
	const seen: Array<string> = [];
	const reporter: ListReporter = ({ current }) => {
		seen.push(current);
		if (current === 'excluded.md') return 'exclude';
		if (current === 'skip/') return 'include';
		if (current.endsWith('/')) return 'advance';
		return 'include';
	};
	const results = await fs.list('/', reporter);
	const keys = results.map((stat: Stat) => stat.key).sort();
	expect(keys).toStrictEqual(['a.md', 'skip/', 'sub/', 'sub/b.md']);
	expect(seen).toContain('excluded.md');
	expect(seen).not.toContain('skip/c.md');
	const fileStat = results.find((stat: Stat) => stat.key === 'sub/b.md');
	expect(fileStat?.isDir).toBe(false);
	if (fileStat?.isDir === false) expect(fileStat.uid).toBe(await md5('b'));
});

test('list from a subfolder returns keys prefixed with that folder', async () => {
	const { fs } = createFs();
	await fs.write('sub/deep/d.md', bytes('d'), file('sub/deep/d.md', { size: 1 }));
	const results = await fs.list('sub/', includeAll);
	const keys = results.map((stat: Stat) => stat.key).sort();
	expect(keys).toStrictEqual(['sub/deep/', 'sub/deep/d.md']);
});

test('move renames files, relocates them between folders, and moves folders whole', async () => {
	const { drive, fs } = createFs();
	await fs.write('a.md', bytes('a'), file('a.md', { size: 1 }));
	await fs.move('a.md', 'renamed.md');
	expect(drive.contentByPath('Vault/Notes/renamed.md')).toBe('a');
	expect(drive.fileByPath('Vault/Notes/a.md')).toBeUndefined();
	expect(await fs.exists('a.md')).toBe(false);
	expect(new TextDecoder().decode(await fs.read('renamed.md', file('renamed.md')))).toBe('a');

	await fs.move('renamed.md', 'other/renamed.md');
	expect(drive.contentByPath('Vault/Notes/other/renamed.md')).toBe('a');

	await fs.write('sub/b.md', bytes('b'), file('sub/b.md', { size: 1 }));
	await fs.move('sub/', 'moved/');
	expect(drive.contentByPath('Vault/Notes/moved/b.md')).toBe('b');
	expect(new TextDecoder().decode(await fs.read('moved/b.md', file('moved/b.md')))).toBe('b');
});

test('delete trashes by default, is idempotent, and can delete permanently', async () => {
	const trashing = createFs();
	await trashing.fs.write('t.md', bytes('t'), file('t.md', { size: 1 }));
	await trashing.fs.delete('t.md');
	const trashed = [...trashing.drive.files.values()].find((entry) => entry.name === 't.md');
	expect(trashed?.trashed).toBe(true);
	expect(await trashing.fs.exists('t.md')).toBe(false);
	await trashing.fs.delete('t.md'); // Missing → silently succeeds
	await trashing.fs.delete('never-existed.md');

	const permanent = createFs({ useTrash: false });
	await permanent.fs.write('p.md', bytes('p'), file('p.md', { size: 1 }));
	await permanent.fs.delete('p.md');
	expect(
		[...permanent.drive.files.values()].find((entry) => entry.name === 'p.md'),
	).toBeUndefined();
});

test('readStream assembles ranged chunks in order', async () => {
	const { fs } = createFs();
	await fs.write('r.md', bytes('ranged content'), file('r.md', { size: 14 }));
	const result = await fs.readStream('r.md', file('r.md', { size: 14 }));
	expect(await collect(result)).toBe('ranged content');
});

test('writeStream below the threshold uses one multipart upload', async () => {
	const { drive, fs } = createFs();
	const uid = await fs.writeStream(
		'small.md',
		createStream(['hello ', 'stream']),
		file('small.md', { mtime: 3000, size: 12 }),
	);
	expect(drive.contentByPath('Vault/Notes/small.md')).toBe('hello stream');
	expect(uid).toBe(await md5('hello stream'));
	const uploadCalls = drive.requestLog.filter(
		(params) => typeof params !== 'string' && params.url.includes('uploadType=multipart'),
	);
	expect(uploadCalls.length).toBe(1);
});

test('writeStream at the threshold uses a chunked resumable session', async () => {
	const { drive, fs } = createFs();
	const big = new Uint8Array(RESUMABLE_CHUNK_SIZE + 3).fill(97);
	const uid = await fs.writeStream(
		'big.bin',
		createStream([big]),
		file('big.bin', { mtime: 4000, size: big.byteLength }),
	);
	const stored = drive.fileByPath('Vault/Notes/big.bin');
	expect(stored?.content?.byteLength).toBe(big.byteLength);
	expect(uid).toBe(await md5(big));
	const sessionPuts = drive.requestLog.filter(
		(params) =>
			typeof params !== 'string' &&
			params.method === 'PUT' &&
			params.url.includes('/mock-session/'),
	);
	expect(sessionPuts.length).toBe(2);
});

test('duplicate names in one folder resolve to the newest file', async () => {
	const { drive, fs } = createFs();
	await fs.mkdir('/', true);
	const base = drive.fileByPath('Vault/Notes');
	drive.addFile('dup.md', base?.id ?? '', 'old', new Date(1000).toISOString());
	drive.addFile('dup.md', base?.id ?? '', 'new', new Date(2000).toISOString());
	expect(new TextDecoder().decode(await fs.read('dup.md', file('dup.md')))).toBe('new');
	const results = await fs.list('/', includeAll);
	expect(results.filter((stat: Stat) => stat.key === 'dup.md').length).toBe(1);
});

test('getUid identifies the account and base directory', () => {
	const { fs } = createFs();
	expect(fs.getUid()).toBe('gdrive~mock@example.com~Vault/Notes/');
});

test('checkConnection reports success and surfaces Drive errors', async () => {
	const { drive } = createFs();
	expect(await checkConnection(drive.request)).toStrictEqual({ success: true });
	drive.failNext = jsonResponse(401, {
		error: { code: 401, message: 'Invalid Credentials' },
	});
	expect(await checkConnection(drive.request)).toStrictEqual({
		reason: 'Google Drive 401: Invalid Credentials',
		success: false,
	});
});
