import { argOf, bodyOf, json } from './helpers';
import { API_CONTENT, API_RPC } from '@/dropbox/api';
import checkConnection from '@/dropbox/check-connection';
import DropboxFs from '@/dropbox/fs';
import { SESSION_CHUNK_SIZE } from '@/dropbox/upload';
import { chunkSize } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { toError } from '@repo/shared/error';
import { expect, test } from 'bun:test';
import type { Control } from './helpers';
import type { FileMetadata, Metadata } from '@/dropbox/api';
import type { Binary, RequestParam, RequestResponse } from '@hesprs/sync-engine-sdk';

const { bytes, deferred, file, folder, flush, request } = testKit;

function createFs(control: Control, useTrash = true) {
	const harness = request(control);
	return {
		calls: harness.calls,
		fs: new DropboxFs(harness.request, { accountId: 'dbid:1', useTrash }),
		request: harness.request,
	};
}

function binary(value: Binary, status = 200): Partial<RequestResponse> {
	return { bytes: () => value, ...json({}, status) };
}

async function until(condition: () => boolean) {
	while (!condition())
		await new Promise<undefined>((resolve) => {
			setTimeout(resolve, 0);
		});
}

/** Answers a finish_batch_v2 request with per-entry flat success metadata named by session id. */
function finishBatchSuccess(params: RequestParam): Partial<RequestResponse> {
	const { entries } = bodyOf(params) as { entries: Array<{ cursor: { session_id: string } }> };
	return json({
		entries: entries.map(({ cursor }) =>
			Object.assign(fileMeta(cursor.session_id, '/x'), { '.tag': 'success' }),
		),
	});
}

function fileMeta(name: string, path: string, overrides: Partial<FileMetadata> = {}): Metadata {
	return {
		'.tag': 'file',
		client_modified: '2024-01-01T10:00:00Z',
		content_hash: `hash-${name}`,
		id: `id:${name}`,
		name,
		path_display: path,
		path_lower: path.toLowerCase(),
		rev: `rev-${name}`,
		server_modified: '2024-01-01T10:00:00Z',
		size: 5,
		...overrides,
	};
}

function folderMeta(name: string, path: string): Metadata {
	return {
		'.tag': 'folder',
		id: `id:${name}`,
		name,
		path_display: path,
		path_lower: path.toLowerCase(),
	};
}

const UPLOAD_URL = `${API_CONTENT}/2/files/upload`;
const DOWNLOAD_URL = `${API_CONTENT}/2/files/download`;
const SESSION_START_URL = `${API_CONTENT}/2/files/upload_session/start`;
const APPEND_URL = `${API_CONTENT}/2/files/upload_session/append_v2`;
const FINISH_URL = `${API_CONTENT}/2/files/upload_session/finish`;
const START_BATCH_URL = `${API_RPC}/2/files/upload_session/start_batch`;
const FINISH_BATCH_URL = `${API_RPC}/2/files/upload_session/finish_batch_v2`;
const NOT_FOUND_409 = {
	error: { '.tag': 'path_lookup', path_lookup: { '.tag': 'not_found' } },
	error_summary: 'path_lookup/not_found/.',
};
const FOLDER_CONFLICT_409 = {
	error: { '.tag': 'path', path: { '.tag': 'conflict', conflict: { '.tag': 'folder' } } },
	error_summary: 'path/conflict/folder/.',
};

test('uploads a file with a single request and returns the content hash', async () => {
	const { calls, fs } = createFs(() => json(fileMeta('note.md', '/note.md')));

	const stat = file('note.md', { meta: () => ({ mtime: String(1_700_000_000_000) }), size: 5 });
	expect(await fs.write('note.md', bytes('hello'), stat)).toBe('hash-note.md');
	expect(calls.length).toBe(1);
	expect(calls[0]?.url).toBe(UPLOAD_URL);
	expect(calls[0]?.headers?.['Content-Type']).toBe('application/octet-stream');
	expect(argOf(calls[0] as RequestParam)).toStrictEqual({
		autorename: false,
		client_modified: '2023-11-14T22:13:20Z',
		mode: 'overwrite',
		mute: true,
		path: '/note.md',
	});
	expect(calls[0]?.body).toStrictEqual(bytes('hello'));
});

test('escapes non-ASCII characters in the argument header', async () => {
	const { calls, fs } = createFs(() => json(fileMeta('note.md', '/노트/note.md')));

	await fs.write('노트/note.md', bytes('hello'), file('노트/note.md', { size: 5 }));

	const header = calls[0]?.headers?.['Dropbox-API-Arg'] ?? '';
	expect(header).not.toContain('노트');
	expect(header).toContain(String.raw`\ub178\ud2b8`);
	expect(argOf(calls[0] as RequestParam).path).toBe('/노트/note.md');
});

test('streams uploads through a concurrent session with aligned chunks', async () => {
	const total = 10 * 1024 ** 2;
	const payload = new Uint8Array(total).map((_, index) => index % 251);
	const chunks: Array<Binary> = [];
	for (let offset = 0; offset < total; offset += 1024 ** 2)
		chunks.push(payload.slice(offset, offset + 1024 ** 2));
	const { calls, fs } = createFs((url) => {
		if (url === SESSION_START_URL) return json({ session_id: 'session-1' });
		if (url === APPEND_URL) return json({});
		if (url === FINISH_URL) return json(fileMeta('big.bin', '/big.bin'));
		throw new Error(`Unexpected request: ${url}`);
	});

	const uid = await fs.writeStream(
		'big.bin',
		new ReadableStream<Binary>({
			start(controller) {
				for (const chunk of chunks) controller.enqueue(chunk);
				controller.close();
			},
		}),
		file('big.bin', { meta: () => ({ mtime: String(1_700_000_000_000) }), size: total }),
	);

	expect(uid).toBe('hash-big.bin');
	expect(calls.map(({ url }) => url)).toStrictEqual([
		SESSION_START_URL,
		APPEND_URL,
		APPEND_URL,
		APPEND_URL,
		FINISH_URL,
	]);
	expect(calls[0]?.body).toBeUndefined();
	expect(argOf(calls[0] as RequestParam)).toStrictEqual({
		close: false,
		session_type: { '.tag': 'concurrent' },
	});
	const offsets = calls.slice(1, 4).map((call) => argOf(call).cursor);
	expect(offsets).toStrictEqual([
		{ offset: 0, session_id: 'session-1' },
		{ offset: SESSION_CHUNK_SIZE, session_id: 'session-1' },
		{ offset: SESSION_CHUNK_SIZE * 2, session_id: 'session-1' },
	]);
	expect(calls.slice(1, 4).map((call) => argOf(call).close)).toStrictEqual([false, false, true]);
	expect(calls.slice(1, 4).map((call) => (call.body as Binary).byteLength)).toStrictEqual([
		SESSION_CHUNK_SIZE,
		SESSION_CHUNK_SIZE,
		2 * 1024 ** 2,
	]);
	const finishArg = argOf(calls[4]);
	expect(finishArg.cursor).toStrictEqual({ offset: total, session_id: 'session-1' });
	expect(finishArg.commit).toStrictEqual({
		autorename: false,
		client_modified: '2023-11-14T22:13:20Z',
		mode: 'overwrite',
		mute: true,
		path: '/big.bin',
	});
	expect(calls[4]?.body).toBeUndefined();
});

test('the session closes on the final full append when the size is a chunk multiple', async () => {
	const total = 8 * 1024 ** 2;
	const payload = new Uint8Array(total).map((_, index) => index % 251);
	const chunks: Array<Binary> = [];
	for (let offset = 0; offset < total; offset += 1024 ** 2)
		chunks.push(payload.slice(offset, offset + 1024 ** 2));
	const { calls, fs } = createFs((url) => {
		if (url === SESSION_START_URL) return json({ session_id: 'session-1' });
		if (url === APPEND_URL) return json({});
		if (url === FINISH_URL) return json(fileMeta('even.bin', '/even.bin'));
		throw new Error(`Unexpected request: ${url}`);
	});

	const uid = await fs.writeStream(
		'even.bin',
		new ReadableStream<Binary>({
			start(controller) {
				for (const chunk of chunks) controller.enqueue(chunk);
				controller.close();
			},
		}),
		file('even.bin', { mtime: 1_700_000_000_000, size: total }),
	);

	expect(uid).toBe('hash-even.bin');
	expect(calls.map(({ url }) => url)).toStrictEqual([
		SESSION_START_URL,
		APPEND_URL,
		APPEND_URL,
		FINISH_URL,
	]);
	expect(calls.slice(1, 3).map((call) => argOf(call).close)).toStrictEqual([false, true]);
	expect(calls.slice(1, 3).map((call) => (call.body as Binary).byteLength)).toStrictEqual([
		SESSION_CHUNK_SIZE,
		SESSION_CHUNK_SIZE,
	]);
	expect(argOf(calls[3]).cursor).toStrictEqual({ offset: total, session_id: 'session-1' });
});

test('holds the closing append until every data append is acknowledged', async () => {
	const total = 10 * 1024 ** 2;
	const payload = new Uint8Array(total);
	const gate1 = deferred<Partial<RequestResponse>>();
	const gate2 = deferred<Partial<RequestResponse>>();
	let appends = 0;
	const { calls, fs } = createFs((url) => {
		if (url === SESSION_START_URL) return json({ session_id: 'session-1' });
		if (url === APPEND_URL) {
			appends += 1;
			if (appends === 1) return gate1.promise;
			if (appends === 2) return gate2.promise;
			return json({});
		}
		if (url === FINISH_URL) return json(fileMeta('big.bin', '/big.bin'));
		throw new Error(`Unexpected request: ${url}`);
	});

	const upload = fs.writeStream(
		'big.bin',
		new ReadableStream<Binary>({
			start(controller) {
				controller.enqueue(payload.slice(0, 4 * 1024 ** 2));
				controller.enqueue(payload.slice(4 * 1024 ** 2, 8 * 1024 ** 2));
				controller.enqueue(payload.slice(8 * 1024 ** 2));
				controller.close();
			},
		}),
		file('big.bin', { size: total }),
	);
	const settle = () =>
		new Promise<undefined>((resolve) => {
			setTimeout(resolve, 0);
		});
	await settle();
	const appendCalls = () => calls.filter((call) => call.url === APPEND_URL);
	expect(appendCalls().length).toBe(2);
	expect(appendCalls().map((call) => argOf(call).close)).toStrictEqual([false, false]);

	gate1.resolve(json({}));
	await settle();
	// One acknowledged data append is not enough: the closer still waits on the second.
	expect(appendCalls().length).toBe(2);

	gate2.resolve(json({}));
	const uid = await upload;
	expect(appendCalls().length).toBe(3);
	expect(argOf(appendCalls()[2] as RequestParam)).toStrictEqual({
		close: true,
		cursor: { offset: 2 * SESSION_CHUNK_SIZE, session_id: 'session-1' },
	});
	expect(calls.at(-1)?.url).toBe(FINISH_URL);
	expect(argOf(calls.at(-1) as RequestParam).cursor).toStrictEqual({
		offset: total,
		session_id: 'session-1',
	});
	expect(uid).toBe('hash-big.bin');
});

test('a failed append rejects the session and releases the source stream', async () => {
	const total = 10 * 1024 ** 2;
	const payload = new Uint8Array(total);
	const { calls, fs } = createFs((url) => {
		if (url === SESSION_START_URL) return json({ session_id: 'session-1' });
		if (url === APPEND_URL) return json(FOLDER_CONFLICT_409, 409);
		if (url === FINISH_URL) return json(fileMeta('big.bin', '/big.bin'));
		throw new Error(`Unexpected request: ${url}`);
	});
	const stream = new ReadableStream<Binary>({
		start(controller) {
			for (let offset = 0; offset < total; offset += 1024 ** 2)
				controller.enqueue(payload.slice(offset, offset + 1024 ** 2));
			controller.close();
		},
	});

	let rejected: unknown;
	try {
		await fs.writeStream('big.bin', stream, file('big.bin', { size: total }));
	} catch (error) {
		rejected = error;
	}

	expect(rejected).toBeInstanceOf(Error);
	expect(calls.some(({ url }) => url === FINISH_URL)).toBe(false);
	// A failed session must not leave the source stream locked.
	await stream.cancel();
});

test('writeStream delegates files below one chunk to the single upload', async () => {
	const { calls, fs } = createFs(() => json(fileMeta('small.md', '/small.md')));

	const uid = await fs.writeStream(
		'small.md',
		new ReadableStream<Binary>({
			start(controller) {
				controller.enqueue(bytes('tiny'));
				controller.close();
			},
		}),
		file('small.md', { size: 4 }),
	);

	expect(uid).toBe('hash-small.md');
	expect(calls.map(({ url }) => url)).toStrictEqual([UPLOAD_URL]);
});

test('downloads files through the content endpoint', async () => {
	const { calls, fs } = createFs(() => binary(bytes('hello')));

	expect(await fs.read('note.md')).toStrictEqual(bytes('hello'));
	expect(calls[0]?.url).toBe(DOWNLOAD_URL);
	expect(argOf(calls[0] as RequestParam)).toStrictEqual({ path: '/note.md' });
});

test('readStream reassembles aligned range requests in order', async () => {
	const size = chunkSize * 2 + 7;
	const payload = new Uint8Array(size).map((_, index) => (index * 13) % 251);
	const { calls, fs } = createFs((url, params) => {
		expect(url).toBe(DOWNLOAD_URL);
		const range = params.headers?.Range ?? '';
		const match = /bytes=(?<start>\d+)-(?<end>\d+)/u.exec(range);
		if (!match?.groups) throw new Error('Missing range header');
		const { start, end } = match.groups;
		return binary(payload.slice(Number(start), Number(end) + 1));
	});

	const stream = fs.readStream('note.md', file('note.md', { size }));
	const received: Array<Binary> = [];
	const reader = stream.getReader();
	while (true) {
		const read = await reader.read();
		if (read.done) break;
		received.push(read.value);
	}

	const joined = new Uint8Array(size);
	let offset = 0;
	for (const chunk of received) {
		joined.set(chunk, offset);
		offset += chunk.byteLength;
	}
	expect(joined).toStrictEqual(payload);
	expect(calls.length).toBe(3);
	expect(calls[0]?.headers?.Range).toBe(`bytes=0-${chunkSize - 1}`);
	expect(calls[2]?.headers?.Range).toBe(`bytes=${chunkSize * 2}-${size - 1}`);
});

test('delete is idempotent when the entry is missing', async () => {
	const { calls, fs } = createFs((url) => {
		expect(url).toBe(`${API_RPC}/2/files/delete_v2`);
		return json(NOT_FOUND_409, 409);
	});

	await fs.delete('gone.md');
	expect(bodyOf(calls[0] as RequestParam)).toStrictEqual({ path: '/gone.md' });
});

test('delete routes between trash and permanent deletion', async () => {
	const trashing = createFs(() => json({ metadata: fileMeta('a.md', '/a.md') }));
	await trashing.fs.delete('a.md');
	expect(trashing.calls[0]?.url).toBe(`${API_RPC}/2/files/delete_v2`);

	const permanent = createFs(() => json({ metadata: fileMeta('a.md', '/a.md') }), false);
	await permanent.fs.delete('a.md');
	expect(permanent.calls[0]?.url).toBe(`${API_RPC}/2/files/permanently_delete`);
});

test('move renames through move_v2 and two-hops case-only renames', async () => {
	const renamed = createFs(() => json({ metadata: fileMeta('y.md', '/y.md') }));
	await renamed.fs.move('x.md', 'y.md');
	expect(renamed.calls.map(({ url }) => url)).toStrictEqual([`${API_RPC}/2/files/move_v2`]);
	expect(bodyOf(renamed.calls[0] as RequestParam)).toStrictEqual({
		autorename: false,
		from_path: '/x.md',
		to_path: '/y.md',
	});

	const caseOnly = createFs(() => json({ metadata: fileMeta('a.md', '/a.md') }));
	await caseOnly.fs.move('A.md', 'a.md');
	expect(caseOnly.calls.map(({ url }) => url)).toStrictEqual([
		`${API_RPC}/2/files/move_v2`,
		`${API_RPC}/2/files/move_v2`,
	]);
	const first = bodyOf(caseOnly.calls[0]);
	const second = bodyOf(caseOnly.calls[1]);
	expect(first.from_path).toBe('/A.md');
	expect(first.to_path).not.toBe('/a.md');
	expect(second).toStrictEqual({ autorename: false, from_path: first.to_path, to_path: '/a.md' });
});

test('mkdir creates the whole chain in one request and tolerates an existing folder', async () => {
	const { calls, fs } = createFs((url, params) => {
		expect(url).toBe(`${API_RPC}/2/files/create_folder_v2`);
		const { path } = bodyOf(params);
		if (path === '/a/b/c') return json(FOLDER_CONFLICT_409, 409);
		return json({ metadata: folderMeta('x', path as string) });
	});

	await fs.mkdir('a/b/c/', folder('a/b/c/'));

	expect(calls.length).toBe(1);
	expect(bodyOf(calls[0] as RequestParam)).toStrictEqual({ autorename: false, path: '/a/b/c' });
});

test('mkdir rejects when a file occupies the folder path', async () => {
	const { fs } = createFs(() =>
		json(
			{
				error: {
					'.tag': 'path',
					path: { '.tag': 'conflict', conflict: { '.tag': 'file' } },
				},
				error_summary: 'path/conflict/file/.',
			},
			409,
		),
	);

	let caught: unknown;
	try {
		await fs.mkdir('occupied/', folder('occupied/'));
	} catch (error) {
		caught = error;
	}
	expect(String(caught)).toContain('conflict');
});

test('stat returns file, folder, and root stats', async () => {
	const { calls, fs } = createFs((url, params) => {
		expect(url).toBe(`${API_RPC}/2/files/get_metadata`);
		const { path } = bodyOf(params);
		if (path === '/note.md') return json(fileMeta('note.md', '/note.md'));
		return json(folderMeta('dir', path as string));
	});

	const fileStat = await fs.stat('note.md');
	expect(fileStat).toStrictEqual({
		isDir: false,
		key: 'note.md',
		// oxlint-disable-next-line typescript/no-unsafe-assignment
		meta: expect.any(Function),
		mtime: Date.parse('2024-01-01T10:00:00Z'),
		size: 5,
		uid: 'hash-note.md',
	});
	expect(fileStat.meta()).toStrictEqual({ mtime: String(Date.parse('2024-01-01T10:00:00Z')) });

	expect(await fs.stat('dir/')).toStrictEqual({
		isDir: true,
		key: 'dir/',
		// oxlint-disable-next-line typescript/no-unsafe-assignment
		meta: expect.any(Function),
	});
	const root = await fs.stat('/');
	expect(root).toStrictEqual({
		isDir: true,
		key: '/',
		// oxlint-disable-next-line typescript/no-unsafe-assignment
		meta: expect.any(Function),
	});
	expect(root.meta()).toStrictEqual({});
	expect(calls.length).toBe(2);
});

test('exists reports missing entries without throwing', async () => {
	const { calls, fs } = createFs((url, params) => {
		expect(url).toBe(`${API_RPC}/2/files/get_metadata`);
		const { path } = bodyOf(params);
		if (path === '/gone.md') return json(NOT_FOUND_409, 409);
		return json(fileMeta('note.md', '/note.md'));
	});

	expect(await fs.exists('/')).toBe(true);
	expect(await fs.exists('gone.md')).toBe(false);
	expect(await fs.exists('note.md')).toBe(true);
	expect(calls.length).toBe(2);
});

test('list paginates, steers traversal, and builds keys from entry names', async () => {
	const nfdName = 'e\u0301.md'.normalize('NFD');
	const page1 = {
		cursor: 'cursor-1',
		entries: [folderMeta('A', '/A'), fileMeta('note.md', '/A/note.md')],
		has_more: true,
	};
	const page2 = {
		cursor: 'cursor-2',
		entries: [
			folderMeta('B', '/A/B'),
			fileMeta('deep.md', '/A/B/deep.md'),
			fileMeta(nfdName, `/A/${nfdName}`),
		],
		has_more: false,
	};
	const { calls, fs } = createFs((url, params) => {
		if (url === `${API_RPC}/2/files/list_folder`) return json(page1);
		expect(url).toBe(`${API_RPC}/2/files/list_folder/continue`);
		expect(bodyOf(params)).toStrictEqual({ cursor: 'cursor-1' });
		return json(page2);
	});

	const progress: Array<{ completed: number; current: string; total: number }> = [];
	const result = await fs.list('/', (report) => {
		progress.push(report);
		return report.current === 'A/B/'
			? 'exclude'
			: report.current === 'A/'
				? 'advance'
				: 'include';
	});

	expect(result.map(({ key }) => key)).toStrictEqual([
		'A/',
		'A/note.md',
		`A/${nfdName}`.normalize('NFC'),
	]);
	const stats = new Map(result.map((stat) => [stat.key, stat]));
	expect(stats.get('A/note.md')).toStrictEqual({
		isDir: false,
		key: 'A/note.md',
		// oxlint-disable-next-line typescript/no-unsafe-assignment
		meta: expect.any(Function),
		mtime: Date.parse('2024-01-01T10:00:00Z'),
		size: 5,
		uid: 'hash-note.md',
	});
	expect(progress).toStrictEqual([
		{ completed: 1, current: 'A/', total: 5 },
		{ completed: 2, current: 'A/note.md', total: 5 },
		{ completed: 3, current: 'A/B/', total: 5 },
		{ completed: 4, current: `A/${nfdName}`.normalize('NFC'), total: 5 },
	]);
	expect(bodyOf(calls[0] as RequestParam)).toStrictEqual({ path: '', recursive: true });
});

test('batchDelete maps position-aligned results and treats not_found as success', async () => {
	const { calls, fs } = createFs((url) => {
		expect(url).toBe(`${API_RPC}/2/files/delete_batch`);
		return json({
			'.tag': 'complete',
			entries: [
				{ '.tag': 'success', metadata: fileMeta('a.md', '/a.md') },
				{ '.tag': 'failure', failure: NOT_FOUND_409.error },
				{ '.tag': 'failure', failure: { '.tag': 'too_many_write_operations' } },
			],
		});
	});

	const result = await fs.batchDelete(['a.md', 'gone.md', 'blocked.md']);

	expect(result['a.md']).toBeUndefined();
	expect(result['gone.md']).toBeUndefined();
	expect(result['blocked.md']?.message).toContain('too_many_write_operations');
	expect(bodyOf(calls[0] as RequestParam)).toStrictEqual({
		entries: [{ path: '/a.md' }, { path: '/gone.md' }, { path: '/blocked.md' }],
	});
});

test('batchDelete deduplicates keys and polls async jobs until complete', async () => {
	let checks = 0;
	const { calls, fs } = createFs((url, params) => {
		if (url === `${API_RPC}/2/files/delete_batch`) {
			expect(bodyOf(params)).toStrictEqual({
				entries: [{ path: '/a.md' }, { path: '/b.md' }],
			});
			return json({ async_job_id: 'job-1' });
		}
		expect(url).toBe(`${API_RPC}/2/files/delete_batch/check`);
		expect(bodyOf(params)).toStrictEqual({ async_job_id: 'job-1' });
		return json(
			++checks === 1
				? { '.tag': 'in_progress' }
				: {
						'.tag': 'complete',
						entries: [
							{ '.tag': 'success', metadata: fileMeta('a.md', '/a.md') },
							{ '.tag': 'success', metadata: fileMeta('b.md', '/b.md') },
						],
					},
		);
	});

	const result = await fs.batchDelete(['a.md', 'a.md', 'b.md']);

	expect(result).toStrictEqual({});
	expect(calls.filter(({ url }) => url.includes('/check')).length).toBe(2);
});

test('batchDelete fires 1000-entry chunks concurrently and maps results across chunks', async () => {
	const keys: Array<string> = [];
	for (let index = 0; index < 1002; index += 1) keys.push(`f${index}.md`);
	const first = deferred<Partial<RequestResponse>>();
	const second = deferred<Partial<RequestResponse>>();
	const { calls, fs } = createFs((url, params) => {
		expect(url).toBe(`${API_RPC}/2/files/delete_batch`);
		const { entries } = bodyOf(params) as { entries: Array<{ path: string }> };
		return entries.length === 1000 ? first.promise : second.promise;
	});

	const pending = fs.batchDelete(keys);
	await flush();
	// Both chunks are in flight before either responds, so the batches run concurrently.
	expect(calls.length).toBe(2);
	const batches = calls.map((call) => bodyOf(call)) as Array<{
		entries: Array<{ path: string }>;
	}>;
	expect(batches[0]?.entries).toHaveLength(1000);
	expect(batches[0]?.entries[0]?.path).toBe('/f0.md');
	expect(batches[1]?.entries).toStrictEqual([{ path: '/f1000.md' }, { path: '/f1001.md' }]);

	first.resolve(
		json({
			'.tag': 'complete',
			entries: Array.from({ length: 1000 }, () => ({ '.tag': 'success' })),
		}),
	);
	second.resolve(
		json({
			'.tag': 'complete',
			entries: [
				{ '.tag': 'success', metadata: fileMeta('f1000.md', '/f1000.md') },
				{ '.tag': 'failure', failure: { '.tag': 'too_many_write_operations' } },
			],
		}),
	);
	const result = await pending;

	expect(result['f0.md']).toBeUndefined();
	expect(result['f1000.md']).toBeUndefined();
	expect(result['f1001.md']?.message).toContain('too_many_write_operations');
});

test('batchMove applies per-entry results by old key and two-hops case-only renames', async () => {
	const moveBodies: Array<Record<string, unknown>> = [];
	const { fs } = createFs((url, params) => {
		if (url === `${API_RPC}/2/files/move_batch_v2`) {
			expect(bodyOf(params)).toStrictEqual({
				autorename: false,
				entries: [{ from_path: '/x.md', to_path: '/y.md' }],
			});
			return json({
				'.tag': 'complete',
				entries: [{ '.tag': 'success', success: fileMeta('y.md', '/y.md') }],
			});
		}
		expect(url).toBe(`${API_RPC}/2/files/move_v2`);
		moveBodies.push(bodyOf(params));
		return json({ metadata: fileMeta('a.md', '/a.md') });
	});

	const result = await fs.batchMove([
		{ newKey: 'y.md', oldKey: 'x.md' },
		{ newKey: 'a.md', oldKey: 'A.md' },
	]);

	expect(result['x.md']).toBeUndefined();
	expect(result['A.md']).toBeUndefined();
	expect(moveBodies.length).toBe(2);
	expect(moveBodies[0]?.from_path).toBe('/A.md');
	expect(moveBodies[1]).toStrictEqual({
		autorename: false,
		from_path: moveBodies[0]?.to_path,
		to_path: '/a.md',
	});
});

test('batchMove reports relocation failures by old key', async () => {
	const { fs } = createFs(() =>
		json({
			'.tag': 'complete',
			entries: [
				{
					'.tag': 'failure',
					failure: {
						'.tag': 'relocation_error',
						relocation_error: {
							'.tag': 'from_lookup',
							from_lookup: { '.tag': 'not_found' },
						},
					},
				},
			],
		}),
	);

	const result = await fs.batchMove([{ newKey: 'y.md', oldKey: 'missing.md' }]);
	expect(result['missing.md']?.message).toContain('not_found');
});

test('batchMkdir sends one flat batch, deduplicates, and tolerates existing folders', async () => {
	const { calls, fs } = createFs(() =>
		json({
			'.tag': 'complete',
			entries: [
				{ '.tag': 'success', metadata: folderMeta('b', '/a/b') },
				{ '.tag': 'failure', failure: FOLDER_CONFLICT_409.error },
				{ '.tag': 'success', metadata: folderMeta('x', '/x') },
			],
		}),
	);

	const result = await fs.batchMkdir(['a/b/', 'a/', 'x/', 'a/b/']);

	expect(result).toStrictEqual({});
	expect(calls.length).toBe(1);
	expect(bodyOf(calls[0] as RequestParam)).toStrictEqual({
		autorename: false,
		paths: ['/a/b', '/a', '/x'],
	});
});

test('batchMkdir maps per-entry failures by position', async () => {
	const { calls, fs } = createFs(() =>
		json({
			'.tag': 'complete',
			entries: [
				{
					'.tag': 'failure',
					failure: { '.tag': 'path', path: { '.tag': 'insufficient_space' } },
				},
				{ '.tag': 'success', metadata: folderMeta('c', '/c') },
			],
		}),
	);

	const result = await fs.batchMkdir(['a/b/', 'c/']);

	expect(result['a/b/']?.message).toContain('insufficient_space');
	expect(result['c/']).toBeUndefined();
	expect(calls.length).toBe(1);
});

test('batchMkdir fires 10000-path chunks concurrently and maps results across chunks', async () => {
	const keys: Array<string> = [];
	for (let index = 0; index < 10_002; index += 1) keys.push(`d${index}/`);
	const first = deferred<Partial<RequestResponse>>();
	const second = deferred<Partial<RequestResponse>>();
	const { calls, fs } = createFs((url, params) => {
		expect(url).toBe(`${API_RPC}/2/files/create_folder_batch`);
		const { paths } = bodyOf(params) as { paths: Array<string> };
		return paths.length === 10_000 ? first.promise : second.promise;
	});

	const pending = fs.batchMkdir(keys);
	await flush();
	// Both chunks are in flight before either responds, so the batches run concurrently.
	expect(calls.length).toBe(2);

	first.resolve(
		json({
			'.tag': 'complete',
			entries: Array.from({ length: 10_000 }, () => ({ '.tag': 'success' })),
		}),
	);
	second.resolve(
		json({
			'.tag': 'complete',
			entries: [
				{ '.tag': 'success', metadata: folderMeta('d10000', '/d10000') },
				{
					'.tag': 'failure',
					failure: { '.tag': 'path', path: { '.tag': 'insufficient_space' } },
				},
			],
		}),
	);
	const result = await pending;

	expect(result['d0/']).toBeUndefined();
	expect(result['d10000/']).toBeUndefined();
	expect(result['d10001/']?.message).toContain('insufficient_space');
});

test('batched writes append into started sessions and settle at finishUploadSessions', async () => {
	const { calls, fs } = createFs((url, params) => {
		if (url === START_BATCH_URL) {
			expect(bodyOf(params)).toStrictEqual({
				num_sessions: 2,
				session_type: { '.tag': 'concurrent' },
			});
			return json({ session_ids: ['session-a', 'session-b'] });
		}
		if (url === APPEND_URL) return json({});
		expect(url).toBe(FINISH_BATCH_URL);
		return finishBatchSuccess(params);
	});

	await fs.startUploadSessions(['a.md', 'b.md']);
	const statOf = (key: string, size: number) =>
		file(key, { meta: () => ({ mtime: String(1_700_000_000_000) }), size });
	const first = fs.write('a.md', bytes('hello'), statOf('a.md', 5));
	await until(() => calls.filter(({ url }) => url === APPEND_URL).length === 1);
	const second = fs.write('b.md', bytes('world'), statOf('b.md', 5));
	await until(() => calls.filter(({ url }) => url === APPEND_URL).length === 2);

	expect(calls.map(({ url }) => url)).toStrictEqual([START_BATCH_URL, APPEND_URL, APPEND_URL]);
	expect(calls.slice(1).map((call) => argOf(call))).toStrictEqual([
		{ close: true, cursor: { offset: 0, session_id: 'session-a' } },
		{ close: true, cursor: { offset: 0, session_id: 'session-b' } },
	]);
	expect(calls[1]?.body).toStrictEqual(bytes('hello'));

	await fs.finishUploadSessions();
	expect(await first).toBe('hash-session-a');
	expect(await second).toBe('hash-session-b');
	expect(
		(
			bodyOf(calls[3] as RequestParam) as {
				entries: Array<{
					commit: Record<string, unknown>;
					cursor: Record<string, unknown>;
				}>;
			}
		).entries,
	).toStrictEqual([
		{
			commit: {
				autorename: false,
				client_modified: '2023-11-14T22:13:20Z',
				mode: 'overwrite',
				mute: true,
				path: '/a.md',
			},
			cursor: { offset: 5, session_id: 'session-a' },
		},
		{
			commit: {
				autorename: false,
				client_modified: '2023-11-14T22:13:20Z',
				mode: 'overwrite',
				mute: true,
				path: '/b.md',
			},
			cursor: { offset: 5, session_id: 'session-b' },
		},
	]);
});

test('a mapped large stream appends to the started session without starting its own', async () => {
	const total = 8 * 1024 ** 2;
	const payload = new Uint8Array(total);
	const { calls, fs } = createFs((url, params) => {
		if (url === START_BATCH_URL) return json({ session_ids: ['session-1'] });
		if (url === APPEND_URL) return json({});
		expect(url).toBe(FINISH_BATCH_URL);
		return finishBatchSuccess(params);
	});

	await fs.startUploadSessions(['big.bin']);
	const upload = fs.writeStream(
		'big.bin',
		new ReadableStream<Binary>({
			start(controller) {
				controller.enqueue(payload.slice(0, 4 * 1024 ** 2));
				controller.enqueue(payload.slice(4 * 1024 ** 2));
				controller.close();
			},
		}),
		file('big.bin', { size: total }),
	);
	await until(() => calls.filter(({ url }) => url === APPEND_URL).length === 2);
	await fs.finishUploadSessions();

	expect(await upload).toBe('hash-session-1');
	expect(calls.map(({ url }) => url)).toStrictEqual([
		START_BATCH_URL,
		APPEND_URL,
		APPEND_URL,
		FINISH_BATCH_URL,
	]);
	expect(calls.some(({ url }) => url === SESSION_START_URL)).toBe(false);
	expect(calls.slice(1, 3).map((call) => argOf(call).close)).toStrictEqual([false, true]);
	expect(
		(
			bodyOf(calls.at(-1) as RequestParam) as {
				entries: Array<{
					commit: Record<string, unknown>;
					cursor: Record<string, unknown>;
				}>;
			}
		).entries,
	).toStrictEqual([
		{
			commit: { autorename: false, mode: 'overwrite', mute: true, path: '/big.bin' },
			cursor: { offset: total, session_id: 'session-1' },
		},
	]);
});

test('a mapped small stream flows through the single-append write path', async () => {
	const { calls, fs } = createFs((url, params) => {
		if (url === START_BATCH_URL) return json({ session_ids: ['session-1'] });
		if (url === APPEND_URL) return json({});
		expect(url).toBe(FINISH_BATCH_URL);
		return finishBatchSuccess(params);
	});

	await fs.startUploadSessions(['small.md']);
	const upload = fs.writeStream(
		'small.md',
		new ReadableStream<Binary>({
			start(controller) {
				controller.enqueue(bytes('tiny'));
				controller.close();
			},
		}),
		file('small.md', { size: 4 }),
	);
	await until(() => calls.filter(({ url }) => url === APPEND_URL).length === 1);
	await fs.finishUploadSessions();

	expect(await upload).toBe('hash-session-1');
	expect(calls.some(({ url }) => url === SESSION_START_URL || url === UPLOAD_URL)).toBe(false);
	expect(calls.map(({ url }) => url)).toStrictEqual([
		START_BATCH_URL,
		APPEND_URL,
		FINISH_BATCH_URL,
	]);
	expect(argOf(calls[1] as RequestParam)).toStrictEqual({
		close: true,
		cursor: { offset: 0, session_id: 'session-1' },
	});
});

test('finishUploadSessions commits only the given keys and skips unknown ones', async () => {
	const { calls, fs } = createFs((url, params) => {
		if (url === START_BATCH_URL) return json({ session_ids: ['session-a', 'session-b'] });
		if (url === APPEND_URL) return json({});
		expect(url).toBe(FINISH_BATCH_URL);
		return finishBatchSuccess(params);
	});

	await fs.startUploadSessions(['a.md', 'b.md']);
	const first = fs.write('a.md', bytes('a'), file('a.md', { size: 1 }));
	await until(() => calls.filter(({ url }) => url === APPEND_URL).length === 1);
	const second = fs.write('b.md', bytes('b'), file('b.md', { size: 1 }));
	await until(() => calls.filter(({ url }) => url === APPEND_URL).length === 2);

	await fs.finishUploadSessions(['a.md', 'ghost.md']);
	expect(await first).toBe('hash-session-a');
	expect(
		(
			bodyOf(calls[3] as RequestParam) as {
				entries: Array<{ commit: unknown; cursor: { offset: number; session_id: string } }>;
			}
		).entries,
	).toStrictEqual([
		{ commit: expect.anything(), cursor: { offset: 1, session_id: 'session-a' } },
	]);

	await fs.finishUploadSessions();
	expect(await second).toBe('hash-session-b');
	expect(
		(
			bodyOf(calls[4] as RequestParam) as {
				entries: Array<{ commit: unknown; cursor: { offset: number; session_id: string } }>;
			}
		).entries,
	).toStrictEqual([
		{ commit: expect.anything(), cursor: { offset: 1, session_id: 'session-b' } },
	]);
});

test('a failed entry rejects only its write and stays pending for the retry', async () => {
	let finishCalls = 0;
	const { calls, fs } = createFs((url, params) => {
		if (url === START_BATCH_URL) return json({ session_ids: ['session-a', 'session-b'] });
		if (url === APPEND_URL) return json({});
		expect(url).toBe(FINISH_BATCH_URL);
		finishCalls += 1;
		if (finishCalls === 1)
			return json({ entries: [{ '.tag': 'failure', failure: { '.tag': 'lookup_failed' } }] });
		return finishBatchSuccess(params);
	});

	await fs.startUploadSessions(['a.md', 'b.md']);
	let failed: Error | undefined;
	const first = fs.write('a.md', bytes('a'), file('a.md', { size: 1 }));
	void first.catch((error: unknown) => (failed = toError(error)));
	await until(() => calls.filter(({ url }) => url === APPEND_URL).length === 1);
	const second = fs.write('b.md', bytes('b'), file('b.md', { size: 1 }));
	await until(() => calls.filter(({ url }) => url === APPEND_URL).length === 2);

	await fs.finishUploadSessions(['a.md']);
	await until(() => failed !== undefined);
	expect((failed as Error).message).toContain('lookup_failed');

	await fs.finishUploadSessions();
	expect(await second).toBe('hash-session-b');
	// The failed mapping stayed, so the key-less commit retries it alongside the other write.
	expect(
		(
			bodyOf(calls.at(-1) as RequestParam) as {
				entries: Array<{ cursor: { session_id: string } }>;
			}
		).entries
			.map(({ cursor }) => cursor.session_id)
			.sort(),
	).toStrictEqual(['session-a', 'session-b']);
});

test('a failed commit request rejects every taken write and keeps them pending', async () => {
	let failing = true;
	const { calls, fs } = createFs((url, params) => {
		if (url === START_BATCH_URL) return json({ session_ids: ['session-a', 'session-b'] });
		if (url === APPEND_URL) return json({});
		expect(url).toBe(FINISH_BATCH_URL);
		if (failing) return json(NOT_FOUND_409, 409);
		return finishBatchSuccess(params);
	});

	await fs.startUploadSessions(['a.md', 'b.md']);
	const first = fs.write('a.md', bytes('a'), file('a.md', { size: 1 }));
	await until(() => calls.filter(({ url }) => url === APPEND_URL).length === 1);
	const second = fs.write('b.md', bytes('b'), file('b.md', { size: 1 }));
	await until(() => calls.filter(({ url }) => url === APPEND_URL).length === 2);

	await fs.finishUploadSessions();
	expect(
		await first.then(
			() => 'ok',
			(error: unknown) => toError(error).message,
		),
	).toContain('not_found');
	expect(
		await second.then(
			() => 'ok',
			(error: unknown) => toError(error).message,
		),
	).toContain('not_found');

	failing = false;
	await fs.finishUploadSessions();
	expect(
		(
			bodyOf(calls.at(-1) as RequestParam) as {
				entries: Array<{ cursor: { session_id: string } }>;
			}
		).entries
			.map(({ cursor }) => cursor.session_id)
			.sort(),
	).toStrictEqual(['session-a', 'session-b']);
});

test('a duplicate startUploadSessions overrides the earlier mapping', async () => {
	let starts = 0;
	const { calls, fs } = createFs((url, params) => {
		if (url === START_BATCH_URL) {
			starts += 1;
			return json({ session_ids: [`session-${starts}`] });
		}
		if (url === APPEND_URL) return json({});
		expect(url).toBe(FINISH_BATCH_URL);
		return finishBatchSuccess(params);
	});

	await fs.startUploadSessions(['a.md']);
	await fs.startUploadSessions(['a.md']);
	const upload = fs.write('a.md', bytes('a'), file('a.md', { size: 1 }));
	await until(() => calls.filter(({ url }) => url === APPEND_URL).length === 1);
	await fs.finishUploadSessions();

	expect(await upload).toBe('hash-session-2');
	expect(argOf(calls[2] as RequestParam).cursor).toStrictEqual({
		offset: 0,
		session_id: 'session-2',
	});
});

test('startUploadSessions starts at most 1000 sessions per request', async () => {
	const sizes: Array<number> = [];
	const { calls, fs } = createFs((url, params) => {
		if (url === APPEND_URL) return json({});
		expect(url).toBe(START_BATCH_URL);
		const { num_sessions: count } = bodyOf(params) as { num_sessions: number };
		sizes.push(count);
		return json({
			session_ids: Array.from({ length: count }, (_, index) => `s${count}-${index}`),
		});
	});
	const keys: Array<string> = [];
	for (let index = 0; index < 1002; index += 1) keys.push(`f${index}.md`);

	await fs.startUploadSessions(keys);
	expect(sizes).toStrictEqual([1000, 2]);

	void fs.write('f1001.md', bytes('x'), file('f1001.md', { size: 1 }));
	await until(() => calls.length === 3);
	expect(argOf(calls[2] as RequestParam).cursor).toStrictEqual({ offset: 0, session_id: 's2-1' });
});

test('the commit-ready callback reports ready writes until cleared', async () => {
	const { calls, fs } = createFs((url) => {
		if (url === START_BATCH_URL) return json({ session_ids: ['s0', 's1', 's2'] });
		if (url === APPEND_URL) return json({});
		throw new Error(`Unexpected request: ${url}`);
	});
	const readyKeys: Array<string> = [];
	fs.setCommitReadyCallback((key) => readyKeys.push(key));

	await fs.startUploadSessions(['a.md', 'b.md', 'c.md']);
	void fs.write('a.md', bytes('a'), file('a.md', { size: 1 }));
	void fs.write('b.md', bytes('b'), file('b.md', { size: 1 }));
	await until(() => readyKeys.length === 2);

	fs.clearCommitReadyCallback();
	void fs.write('c.md', bytes('c'), file('c.md', { size: 1 }));
	await until(() => calls.filter(({ url }) => url === APPEND_URL).length === 3);
	expect(readyKeys.sort()).toStrictEqual(['a.md', 'b.md']);
});

test('checkConnection validates the token through a root listing', async () => {
	const failing = createFs(() => json({ error: { '.tag': 'invalid_access_token' } }, 401));
	const failure = await checkConnection(failing.request, 'id');
	expect(failure).toBeInstanceOf(Error);
	expect(String(failure)).toContain('invalid_access_token');

	const passing = createFs((url) => {
		expect(url).toBe(`${API_RPC}/2/files/list_folder`);
		return json({ cursor: '', entries: [], has_more: false });
	});
	expect(await checkConnection(passing.request, 'id')).toBeUndefined();
});
