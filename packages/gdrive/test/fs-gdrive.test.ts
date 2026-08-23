import type { Binary, Request, RequestParam, RequestResponse } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { beforeEach, expect, test } from 'bun:test';
import { openMemoryDB } from 'uni-kv';
import type { GdriveDB } from '@/gdrive/fs';
import { DRIVE_API, DRIVE_UPLOAD_API, FOLDER_MIME } from '@/gdrive/api';
import GdriveFs from '@/gdrive/fs';

const { bytes, file } = testKit;
const db: GdriveDB = openMemoryDB<{ gdriveIds: string }, { gdriveIdsMarker?: string }>(
	'gdrive-fs-test',
);

function response(
	value: unknown = {},
	status = 200,
	headers: Record<string, string> = {},
): RequestResponse {
	const body = new TextEncoder().encode(JSON.stringify(value));
	return {
		bytes: () => body,
		headers,
		json: () => value,
		status,
		text: () => new TextDecoder().decode(body),
	};
}

function binaryResponse(value: Binary, status = 200): RequestResponse {
	return { ...response({}, status), bytes: () => value };
}

function createFs(handler: (params: RequestParam) => RequestResponse | Promise<RequestResponse>) {
	const calls: Array<RequestParam> = [];
	const request: Request = (params) => {
		if (typeof params === 'string') throw new Error('Unexpected string request');
		calls.push(params);
		return Promise.resolve(handler(params));
	};
	return { calls, fs: new GdriveFs(request, { useTrash: true, userId: 'user-1' }, db) };
}

beforeEach(() => {
	db.clearStores();
	db.setMeta('gdriveIdsMarker', undefined);
});

test('writes and reads a file through Drive resumable upload', async () => {
	const { calls, fs } = createFs((params) => {
		if (params.url.startsWith(DRIVE_UPLOAD_API) && params.method === 'POST')
			return response({}, 200, { Location: 'https://upload.example/session' });
		if (params.url === 'https://upload.example/session')
			return response({ id: 'file-1', md5Checksum: 'drive-uid' });
		if (params.url === `${DRIVE_API}/files/file-1?alt=media`)
			return binaryResponse(bytes('hello'));
		throw new Error(`Unexpected request: ${params.method} ${params.url}`);
	});

	const stat = file('note.md', { mtime: 1_700_000_000_000, size: 5 });
	expect(await fs.write('note.md', bytes('hello'), stat)).toBe('drive-uid');
	expect(await fs.read('note.md')).toStrictEqual(bytes('hello'));
	expect(calls.map(({ method }) => method)).toStrictEqual(['POST', 'PUT', 'GET']);
	expect(calls[0]?.url).toContain('uploadType=resumable');
});

test('creates folders, lists visible descendants, and honors excluded subtrees', async () => {
	const { calls, fs } = createFs((params) => {
		if (params.method === 'POST' && params.url.startsWith(`${DRIVE_API}/files`))
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
	const { calls, fs } = createFs((params) => {
		if (params.method === 'POST' && params.url.startsWith(DRIVE_UPLOAD_API))
			return response({}, 200, { location: 'https://upload.example/session' });
		if (params.url === 'https://upload.example/session') return response({ id: 'file-1' });
		if (params.method === 'PATCH') return response({ id: 'file-1' });
		throw new Error(`Unexpected request: ${params.method} ${params.url}`);
	});

	await fs.write('old.md', bytes('x'), file('old.md', { size: 1 }));
	await fs.move('old.md', 'new.md');
	const move = calls.find((call) => call.method === 'PATCH');
	expect(move?.url).toContain('/files/file-1');
	expect(new TextDecoder().decode(move?.body as Binary)).toBe('{"name":"new.md"}');
});
