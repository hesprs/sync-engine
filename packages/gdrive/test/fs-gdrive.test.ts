import type { Binary, MaybePromise, RequestParam, RequestResponse } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { beforeEach, expect, test } from 'bun:test';
import { openMemoryDB } from 'uni-kv';
import type { GdriveDB } from '@/gdrive/fs';
import { DRIVE_API, DRIVE_UPLOAD_API, FOLDER_MIME } from '@/gdrive/api';
import GdriveFs from '@/gdrive/fs';

const { bytes, file, request } = testKit;
const db: GdriveDB = openMemoryDB<{ gdriveIds: string }, { gdriveIdsMarker?: string }>(
	'gdrive-fs-test',
);

type Control = (url: string, params: RequestParam) => MaybePromise<Partial<RequestResponse>>;

function response(value: unknown = {}, status = 200, headers: Record<string, string> = {}) {
	const body = new TextEncoder().encode(JSON.stringify(value));
	return {
		bytes: () => body,
		headers,
		// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
		json: <T extends object = object>() => value as T,
		status,
		text: () => new TextDecoder().decode(body),
	};
}

function binaryResponse(value: Binary, status = 200) {
	return { ...response({}, status), bytes: () => value };
}

function createFs(handler: Control) {
	const harness = request(handler);
	return {
		calls: harness.calls,
		fs: new GdriveFs(harness.request, { useTrash: true, userId: 'user-1' }, db),
	};
}

beforeEach(() => {
	db.clearStores();
	db.setMeta('gdriveIdsMarker', undefined);
});

test('writes and reads a file through Drive multipart upload', async () => {
	const { calls, fs } = createFs((url, params) => {
		if (url.startsWith(DRIVE_UPLOAD_API) && params.method === 'POST')
			return response({ id: 'file-1', md5Checksum: 'drive-uid' });
		if (url === `${DRIVE_API}/files/file-1?alt=media`) return binaryResponse(bytes('hello'));
		throw new Error(`Unexpected request: ${params.method} ${url}`);
	});

	const stat = file('note.md', { mtime: 1_700_000_000_000, size: 5 });
	expect(await fs.write('note.md', bytes('hello'), stat)).toBe('drive-uid');
	expect(await fs.read('note.md')).toStrictEqual(bytes('hello'));
	expect(calls.map(({ method }) => method)).toStrictEqual(['POST', 'GET']);
	expect(calls[0]?.url).toContain('uploadType=multipart');
	expect(calls[0]?.headers?.['Content-Type']).toContain('multipart/related');
	const body = new TextDecoder().decode(calls[0]?.body as Binary);
	expect(body).toContain('"name":"note.md"');
	expect(body).toMatch(/hello\r\n--sync-engine-[0-9a-f-]+--$/u);
});

test('creates folders, lists visible descendants, and honors excluded subtrees', async () => {
	const { calls, fs } = createFs((url, params) => {
		if (params.method === 'POST' && url.startsWith(`${DRIVE_API}/files`))
			return response({ id: 'folder-1' });
		return response({
			files: [
				{ id: 'folder-1', mimeType: FOLDER_MIME, name: 'notes', parents: ['root'] },
				{
					id: 'file-1',
					md5Checksum: 'uid',
					mimeType: 'text/markdown',
					modifiedTime: new Date(1000).toISOString(),
					name: 'note.md',
					parents: ['folder-1'],
					size: '5',
				},
			],
		});
	});

	await fs.mkdir('notes/', true);
	const result = await fs.list('/', ({ current }) =>
		current === 'notes/' ? 'include' : 'advance',
	);
	expect(result).toStrictEqual([{ isDir: true, key: 'notes/' }]);
	expect(calls[0]?.method).toBe('POST');
	expect(new TextDecoder().decode(calls[0]?.body as Binary)).toContain(FOLDER_MIME);
});

test('moves a cached file with Drive native rename', async () => {
	const { calls, fs } = createFs((url, params) => {
		if (params.method === 'POST' && url.startsWith(DRIVE_UPLOAD_API))
			return response({ id: 'file-1' });
		if (params.method === 'PATCH') return response({ id: 'file-1' });
		throw new Error(`Unexpected request: ${params.method} ${url}`);
	});

	await fs.write('old.md', bytes('x'), file('old.md', { size: 1 }));
	await fs.move('old.md', 'new.md');
	const move = calls.find((call) => call.method === 'PATCH');
	expect(move?.url).toContain('/files/file-1');
	expect(new TextDecoder().decode(move?.body as Binary)).toBe('{"name":"new.md"}');
});

test('uploads streamed files in ascending contiguous chunks over one resumable session', async () => {
	const chunkSize = 8 * 1024 ** 2; // Fixed upload chunk size, independent of SDK settings.
	const location = 'https://upload.googleapis.com/session/1';
	let puts = 0;
	const { calls, fs } = createFs((url, params) => {
		if (params.method === 'POST') return response({}, 200, { location });
		if (params.method === 'PUT')
			return ++puts < 3
				? response({}, 308)
				: response({ id: 'file-1', md5Checksum: 'drive-uid' });
		throw new Error(`Unexpected request: ${params.method} ${url}`);
	});

	const pieces = [
		bytes('a'.repeat(1000)),
		new Uint8Array(chunkSize).fill(1),
		new Uint8Array(chunkSize).fill(2),
		bytes('b'.repeat(5)),
	];
	const total = pieces.reduce((sum, piece) => sum + piece.byteLength, 0);
	const stream = new ReadableStream<Binary>({
		start(controller) {
			pieces.forEach((piece) => controller.enqueue(piece));
			controller.close();
		},
	});

	expect(
		await fs.writeStream('big.bin', stream, file('big.bin', { mtime: 1, size: total })),
	).toBe('drive-uid');
	const ranges = calls
		.filter((call) => call.method === 'PUT')
		.map((call) => call.headers?.['Content-Range']);
	expect(ranges).toStrictEqual([
		`bytes 0-${chunkSize - 1}/${total}`,
		`bytes ${chunkSize}-${chunkSize * 2 - 1}/${total}`,
		`bytes ${chunkSize * 2}-${total - 1}/${total}`,
	]);
});
