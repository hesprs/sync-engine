import type {
	Binary,
	MaybePromise,
	Progress,
	RequestParam,
	RequestResponse,
} from '@hesprs/sync-engine-sdk';
import { chunkSize } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { beforeEach, expect, mock, test } from 'bun:test';
import type { WebdavFsOptions } from '@/webdav/fs';
import { checkConnection } from '@/webdav/check-connection';
import WebdavFs from '@/webdav/fs';

const { bytes, deferred, file, flush, request, stream: createStream } = testKit;
const sharedDate = new Date('Mon, 01 Jan 2024 00:00:00 GMT').valueOf();

type Control = (url: string, params: RequestParam) => MaybePromise<Partial<RequestResponse>>;
type ParsedResponse = { multistatus: { response: Array<unknown> } };

const emptyBinary: Binary = new Uint8Array(0);
const defaultResponse = {
	bytes: () => emptyBinary,
	text: () => '',
};

let response: Partial<RequestResponse>;
let parsedResponse: ParsedResponse;

const defaultOptions = {
	depthInfinity: false,
	endpoint: 'https://dav.example.com/dav',
	password: 'pass',
	username: 'alice',
} satisfies Omit<WebdavFsOptions, 'request'>;

void mock.module('@repo/shared/parse-xml', () => ({
	default: () => parsedResponse,
}));

beforeEach(() => {
	response = defaultResponse;
	parsedResponse = {
		multistatus: {
			response: [],
		},
	};
});

function createWebdavFs(options: Partial<WebdavFsOptions> = {}) {
	let requestHandler: Control = () => response;
	const harness = request((url, params) => requestHandler(url, params));

	return {
		calls: harness.calls,
		fs: new WebdavFs({ ...defaultOptions, ...options, request: harness.request }),
		setRequest: (handler: Control) => {
			requestHandler = handler;
		},
	};
}

function setXmlResponse(items: Array<unknown>, text = '<xml />') {
	response = {
		bytes: () => emptyBinary,
		status: 207,
		text: () => text,
	};
	parsedResponse = {
		multistatus: {
			response: items,
		},
	};
}

async function collectStream(source: ReadableStream<Binary>): Promise<Binary> {
	const reader = source.getReader();
	const chunks: Array<Binary> = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			total += value.byteLength;
		}
	} finally {
		reader.releaseLock();
	}
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return merged;
}

test('checkConnection returns success for a healthy endpoint', async () => {
	const harness = request(() => defaultResponse);

	expect(await checkConnection(defaultOptions, harness.request)).toStrictEqual({ success: true });
	expect(harness.calls[0]).toMatchObject({
		method: 'PROPFIND',
		url: 'https://dav.example.com/dav/',
	});
});

test('checkConnection returns failure reason for bad status', async () => {
	const harness = request(() => ({ status: 503, text: () => '' }));

	expect(await checkConnection(defaultOptions, harness.request)).toStrictEqual({
		reason: '503',
		success: false,
	});
});

test('stat parses dav fields and prefers etag for uid', async () => {
	setXmlResponse([
		{
			href: 'https://dav.example.com/remote.php/dav/files/alice/Notes/file.md',
			propstat: {
				prop: {
					getcontentlength: { '#text': '12' },
					getetag: 'W/"etag-123"',
					getlastmodified: { '#text': 'Mon, 01 Jan 2024 00:00:00 GMT' },
					resourcetype: {},
				},
				status: 'HTTP/1.1 200 OK',
			},
		},
	]);

	const webdav = createWebdavFs({
		endpoint: 'https://dav.example.com/remote.php/dav/files/alice',
	});

	const stat = await webdav.fs.stat('Notes/file.md');

	expect(webdav.calls[0]?.url).toBe(
		'https://dav.example.com/remote.php/dav/files/alice/Notes/file.md',
	);
	expect(stat).toStrictEqual({
		isDir: false,
		key: 'Notes/file.md',
		mtime: sharedDate,
		size: 12,
		uid: '"etag-123"',
	});
});

test('writeStream buffers chunks into one put', async () => {
	const webdav = createWebdavFs();
	webdav.setRequest((url, params) => {
		expect(params.method).toBe('PUT');
		expect(url).toBe('https://dav.example.com/dav/Notes/file.md');
		expect(params.body).toStrictEqual(bytes('hello'));
		return { ...defaultResponse, headers: { etag: 'buffered-uid' } };
	});

	const source = createStream([bytes('he'), bytes('llo')]);
	const uid = await webdav.fs.writeStream(
		'Notes/file.md',
		source,
		file('Notes/file.md', { size: 5 }),
	);
	expect(uid).toBe('buffered-uid');
	expect(webdav.calls).toHaveLength(1);
});

test('chunked writeStream uses exact Nextcloud urls and headers', async () => {
	const webdav = createWebdavFs({
		chunkedUpload: true,
		endpoint: 'https://dav.example.com/remote.php/dav/files/alice',
	});
	let uploadFolderUrl = '';
	const destination = 'https://dav.example.com/remote.php/dav/files/alice/Notes/file.md';
	webdav.setRequest((url, params) => {
		if (params.method === 'MKCOL') {
			uploadFolderUrl = url;
			expect(params.headers).toMatchObject({
				Destination: destination,
			});
			return { ...defaultResponse, status: 201 };
		}
		if (params.method === 'PUT') {
			expect(url).toBe(`${uploadFolderUrl}1`);
			expect(params.headers).toMatchObject({
				Destination: destination,
				'OC-Total-Length': '7',
			});
			return { ...defaultResponse, status: 200 };
		}
		if (params.method === 'MOVE') {
			expect(url).toBe(`${uploadFolderUrl}.file`);
			expect(params.headers).toMatchObject({
				Destination: destination,
			});
			return { ...defaultResponse, headers: { 'oc-etag': 'oc-uid' } };
		}
		throw new Error(`Unexpected method: ${params.method}`);
	});

	const source = createStream([bytes('abc'), bytes('defg')]);
	const uid = await webdav.fs.writeStream(
		'Notes/file.md',
		source,
		file('Notes/file.md', { size: 7 }),
	);
	expect(uid).toBe('oc-uid');
	expect(webdav.calls.map(({ method, url }) => ({ method, url }))).toStrictEqual([
		{ method: 'MKCOL', url: uploadFolderUrl },
		{ method: 'PUT', url: `${uploadFolderUrl}1` },
		{ method: 'MOVE', url: `${uploadFolderUrl}.file` },
	]);
	expect(uploadFolderUrl).toMatch(
		/^https:\/\/dav\.example\.com\/remote\.php\/dav\/uploads\/alice\/[^/]+\/$/u,
	);
});

test('empty chunked stream skips put and still mkcol move', async () => {
	const webdav = createWebdavFs({ chunkedUpload: true });
	let uploadFolderUrl = '';
	webdav.setRequest((url, params) => {
		if (params.method === 'MKCOL') {
			uploadFolderUrl = url;
			return { ...defaultResponse, status: 201 };
		}
		if (params.method === 'MOVE') return { ...defaultResponse, headers: { etag: 'empty-uid' } };
		throw new Error(`Unexpected method: ${params.method}`);
	});

	const source = createStream([]);
	const uid = await webdav.fs.writeStream(
		'Notes/empty.md',
		source,
		file('Notes/empty.md', { size: 0 }),
	);
	expect(uid).toBe('empty-uid');
	expect(webdav.calls.map(({ method, url }) => ({ method, url }))).toStrictEqual([
		{ method: 'MKCOL', url: uploadFolderUrl },
		{ method: 'MOVE', url: `${uploadFolderUrl}.file` },
	]);
});

test('chunked upload error deletes temp folder and rethrows original error', () => {
	const webdav = createWebdavFs({ chunkedUpload: true });
	let uploadFolderUrl = '';
	const uploadError = new Error('upload failed');
	webdav.setRequest((url, params) => {
		if (params.method === 'MKCOL') {
			uploadFolderUrl = url;
			return { ...defaultResponse, status: 201 };
		}
		if (params.method === 'PUT') throw uploadError;
		if (params.method === 'DELETE') return defaultResponse;
		throw new Error(`Unexpected method: ${params.method}`);
	});

	const source = createStream([bytes('chunk')]);
	expect(
		webdav.fs.writeStream('Notes/fail.md', source, file('Notes/fail.md', { size: 5 })),
	).rejects.toBe(uploadError);
	expect(webdav.calls.map(({ method, url }) => ({ method, url }))).toStrictEqual([
		{ method: 'MKCOL', url: uploadFolderUrl },
		{ method: 'PUT', url: `${uploadFolderUrl}1` },
		{ method: 'DELETE', url: uploadFolderUrl },
	]);
});

test('chunked finalization error deletes temp folder and rethrows original error', () => {
	const webdav = createWebdavFs({ chunkedUpload: true });
	let uploadFolderUrl = '';
	const moveError = new Error('move failed');
	webdav.setRequest((url, params) => {
		if (params.method === 'MKCOL') {
			uploadFolderUrl = url;
			return { ...defaultResponse, status: 201 };
		}
		if (params.method === 'PUT') return { ...defaultResponse, status: 200 };
		if (params.method === 'MOVE') throw moveError;
		if (params.method === 'DELETE') return defaultResponse;
		throw new Error(`Unexpected method: ${params.method}`);
	});

	const source = createStream([bytes('chunk')]);
	expect(
		webdav.fs.writeStream('Notes/finalize.md', source, file('Notes/finalize.md', { size: 5 })),
	).rejects.toBe(moveError);
	expect(webdav.calls.map(({ method, url }) => ({ method, url }))).toStrictEqual([
		{ method: 'MKCOL', url: uploadFolderUrl },
		{ method: 'PUT', url: `${uploadFolderUrl}1` },
		{ method: 'MOVE', url: `${uploadFolderUrl}.file` },
		{ method: 'DELETE', url: uploadFolderUrl },
	]);
});

test('delete swallows 404 and rethrows other failures', async () => {
	let attempts = 0;
	const webdav = createWebdavFs({ endpoint: 'https://dav.example.com' });
	webdav.setRequest(() => {
		attempts += 1;
		return { ...defaultResponse, status: attempts === 1 ? 404 : 500 };
	});

	await webdav.fs.delete('Notes/file.md');
	expect(webdav.fs.delete('Notes/file.md')).rejects.toThrow('WebDAV request failed: 500 DELETE');
});

test('requestOrThrow throws parsed WebDAV error message with status', () => {
	const webdav = createWebdavFs();
	webdav.setRequest(() => ({ ...defaultResponse, status: 409 }));
	parsedResponse = { error: { message: 'File name is too long' } } as never;

	return expect(webdav.fs.move('Notes/a.md', 'Notes/b.md')).rejects.toMatchObject({
		message: 'File name is too long',
		status: 409,
	});
});

test('mkdir recursively creates parent folders in order', async () => {
	const webdav = createWebdavFs({ endpoint: 'https://dav.example.com/dav' });
	webdav.setRequest((url, _params) => {
		if (url === 'https://dav.example.com/dav/Notes/') return response;
		if (url === 'https://dav.example.com/dav/Notes/Folder%20A/')
			return { ...defaultResponse, status: 405 };
		if (url === 'https://dav.example.com/dav/Notes/Folder%20A/Child/') return response;
		throw new Error(`Unexpected URL: ${url}`);
	});

	await webdav.fs.mkdir('Notes/Folder A/Child/', true);

	expect(
		webdav.calls.map((params) => ({ method: params.method, url: params.url })),
	).toStrictEqual([
		{ method: 'MKCOL', url: 'https://dav.example.com/dav/Notes/' },
		{ method: 'MKCOL', url: 'https://dav.example.com/dav/Notes/Folder%20A/' },
		{ method: 'MKCOL', url: 'https://dav.example.com/dav/Notes/Folder%20A/Child/' },
	]);
});

test('list uses infinity when enabled', async () => {
	setXmlResponse([
		{
			href: '/dav/Notes/',
			propstat: {
				prop: { resourcetype: { collection: {} } },
				status: 'HTTP/1.1 200 OK',
			},
		},
		{
			href: '/dav/Notes/file.md',
			propstat: {
				prop: {
					getcontentlength: '3',
					getlastmodified: 'Mon, 01 Jan 2024 00:00:00 GMT',
					resourcetype: {},
				},
				status: 'HTTP/1.1 200 OK',
			},
		},
	]);

	const webdav = createWebdavFs({ depthInfinity: true, endpoint: 'https://dav.example.com/dav' });
	let storedProgress: Progress = { completed: 0, total: 0 };
	const list = await webdav.fs.list('Notes/', (progress) => {
		storedProgress = progress;
		return 'include';
	});

	expect(webdav.calls[0]).toMatchObject({
		headers: expect.objectContaining({ Depth: 'infinity' }) as never,
		method: 'PROPFIND',
	});
	expect(list).toStrictEqual([
		{
			isDir: false,
			key: 'Notes/file.md',
			mtime: sharedDate,
			size: 3,
			uid: `${sharedDate}~3`,
		},
	]);
	expect(storedProgress).toStrictEqual({
		completed: 1,
		current: 'Notes/file.md',
		total: 1,
	});
});

test('list bfs updates progress when infinity is disabled', async () => {
	const rootItems = [
		{
			href: 'https://dav.example.com/dav/Notes/',
			propstat: {
				prop: { resourcetype: { collection: {} } },
				status: 'HTTP/1.1 200 OK',
			},
		},
		{
			href: 'https://dav.example.com/dav/Notes/Folder%20A/',
			propstat: {
				prop: { resourcetype: { collection: {} } },
				status: 'HTTP/1.1 200 OK',
			},
		},
	];
	const childItems = [
		{
			href: 'https://dav.example.com/dav/Notes/Folder%20A/',
			propstat: {
				prop: { resourcetype: { collection: {} } },
				status: 'HTTP/1.1 200 OK',
			},
		},
		{
			href: 'https://dav.example.com/dav/Notes/Folder%20A/file.md',
			propstat: {
				prop: {
					getcontentlength: '7',
					getlastmodified: 'Mon, 01 Jan 2024 00:00:00 GMT',
					resourcetype: {},
				},
				status: 'HTTP/1.1 200 OK',
			},
		},
	];

	const webdav = createWebdavFs({ endpoint: 'https://dav.example.com/dav' });
	webdav.setRequest((url, _params) => {
		if (url === 'https://dav.example.com/dav/Notes/') {
			setXmlResponse(rootItems);
			return response;
		}
		if (url === 'https://dav.example.com/dav/Notes/Folder%20A/') {
			setXmlResponse(childItems);
			return response;
		}
		throw new Error(`Unexpected URL: ${url}`);
	});

	let storedProgress: Progress = { completed: 0, total: 0 };
	const list = await webdav.fs.list('Notes/', (progress) => {
		storedProgress = progress;
		return 'advance';
	});

	expect(list).toStrictEqual([
		{ isDir: true, key: 'Notes/Folder A/' },
		{
			isDir: false,
			key: 'Notes/Folder A/file.md',
			mtime: sharedDate,
			size: 7,
			uid: `${sharedDate}~7`,
		},
	]);
	expect(storedProgress).toStrictEqual({
		completed: 3,
		current: 'Notes/Folder A/file.md',
		total: 3,
	});
});

test('list reporter can exclude entries and stop descent', async () => {
	const rootItems = [
		{
			href: 'https://dav.example.com/dav/Notes/',
			propstat: {
				prop: { resourcetype: { collection: {} } },
				status: 'HTTP/1.1 200 OK',
			},
		},
		{
			href: 'https://dav.example.com/dav/Notes/Folder%20A/',
			propstat: {
				prop: { resourcetype: { collection: {} } },
				status: 'HTTP/1.1 200 OK',
			},
		},
		{
			href: 'https://dav.example.com/dav/Notes/skip.md',
			propstat: {
				prop: {
					getcontentlength: '4',
					getlastmodified: 'Mon, 01 Jan 2024 00:00:00 GMT',
					resourcetype: {},
				},
				status: 'HTTP/1.1 200 OK',
			},
		},
	];

	const webdav = createWebdavFs({ endpoint: 'https://dav.example.com/dav' });
	webdav.setRequest((url, _params) => {
		if (url === 'https://dav.example.com/dav/Notes/') {
			setXmlResponse(rootItems);
			return response;
		}
		throw new Error(`Unexpected recursive request: ${url}`);
	});

	const list = await webdav.fs.list('Notes/', ({ current }) =>
		current === 'Notes/Folder A/' ? 'include' : 'exclude',
	);

	expect(list).toStrictEqual([{ isDir: true, key: 'Notes/Folder A/' }]);
	expect(webdav.calls).toHaveLength(1);
});

test('readStream requests SDK chunk size ranges from stat size', async () => {
	const size = 5 * 1024 * 1024 + 1;
	setXmlResponse([
		{
			href: 'https://dav.example.com/dav/Notes/file.bin',
			propstat: {
				prop: {
					getcontentlength: String(size),
					getlastmodified: 'Mon, 01 Jan 2024 00:00:00 GMT',
					resourcetype: {},
				},
				status: 'HTTP/1.1 200 OK',
			},
		},
	]);

	const ranges: Array<string> = [];
	const encodings: Array<string | undefined> = [];
	const pending = new Map<string, ReturnType<typeof deferred<Partial<RequestResponse>>>>();
	const webdav = createWebdavFs({ endpoint: 'https://dav.example.com/dav' });
	webdav.setRequest((_url, params) => {
		if (params.method === 'PROPFIND') return response;
		const range = params.headers?.Range ?? '';
		ranges.push(range);
		encodings.push(params.headers?.['Accept-Encoding']);
		const wait = deferred<Partial<RequestResponse>>();
		pending.set(range, wait);
		return wait.promise;
	});

	const expectedRanges = Array.from({ length: Math.ceil(size / chunkSize) }, (_, index) => {
		const start = index * chunkSize;
		return `bytes=${start}-${Math.min(start + chunkSize - 1, size - 1)}`;
	});

	const collected = collectStream(
		webdav.fs.readStream('Notes/file.bin', file('Notes/file.bin', { size })),
	);
	await flush();
	expect(ranges).toStrictEqual(expectedRanges);
	expect(encodings.every((encoding) => encoding === 'identity')).toBe(true);

	const makeResponse = (byte: number): Partial<RequestResponse> => ({
		bytes: () => new Uint8Array([byte]),
		status: 206,
	});

	for (let index = expectedRanges.length - 1; index >= 0; index--)
		pending.get(expectedRanges[index])?.resolve(makeResponse(index + 1));

	await flush();
	expect(ranges).toStrictEqual(expectedRanges);
	expect(await collected).toStrictEqual(
		new Uint8Array(expectedRanges.map((_, index) => index + 1)),
	);
});
