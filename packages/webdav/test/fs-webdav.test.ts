import type { Binary, Progress, Request, RootFs } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { beforeEach, expect, mock, test } from 'bun:test';
import type { WebdavFsOptions } from '@/webdav/fs';
import { checkConnection } from '@/webdav/check-connection';
import WebdavFs from '@/webdav/fs';
import createWebDAVReadStream from '@/webdav/read-stream';

const { bytes, deferred, file, flush, stream: createStream } = testKit;
const sharedDate = new Date('Mon, 01 Jan 2024 00:00:00 GMT').valueOf();

type RequestParam = Exclude<Parameters<Request>[0], string>;
type RequestResponse = Awaited<ReturnType<Request>>;
type RequestHandler = (params: RequestParam) => RequestResponse | Promise<RequestResponse>;
type ParsedResponse = { multistatus: { response: Array<unknown> } };
type WebdavHarness = {
	calls: Array<RequestParam>;
	fs: RootFs;
	setRequest: (handler: RequestHandler) => void;
};

const emptyBinary: Binary = new Uint8Array(0);
const defaultResponse: RequestResponse = {
	bytes: () => emptyBinary,
	headers: {},
	json: () => void 0,
	status: 200,
	text: () => '',
};

let response: RequestResponse;
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

function createWebdavFs(options: Partial<WebdavFsOptions> = {}): WebdavHarness {
	const calls: Array<RequestParam> = [];
	let requestHandler: RequestHandler = () => response;
	const request = (params: RequestParam | string) =>
		Promise.resolve().then(() => {
			if (typeof params === 'string') throw new Error(`Unexpected string request: ${params}`);
			calls.push(params);
			return requestHandler(params);
		});

	return {
		calls,
		fs: new WebdavFs({ ...defaultOptions, ...options, request }),
		setRequest: (handler: RequestHandler) => {
			requestHandler = handler;
		},
	};
}

function setXmlResponse(items: Array<unknown>, text = '<xml />') {
	response = {
		bytes: () => emptyBinary,
		headers: {},
		json: () => void 0,
		status: 207,
		text: () => text,
	};
	parsedResponse = {
		multistatus: {
			response: items,
		},
	};
}

function filledBinary(size: number, value: number) {
	return new Uint8Array(size).fill(value);
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
	const calls: Array<RequestParam> = [];
	const request = (params: RequestParam | string) =>
		Promise.resolve().then(() => {
			if (typeof params === 'string') throw new Error(`Unexpected string request: ${params}`);
			calls.push(params);
			return { ...defaultResponse, status: 200 };
		});

	expect(await checkConnection(defaultOptions, request)).toStrictEqual({ success: true });
	expect(calls[0]).toMatchObject({ method: 'PROPFIND', url: 'https://dav.example.com/dav/' });
});

test('checkConnection returns failure reason for bad status', async () => {
	const request = (() => Promise.resolve({ ...defaultResponse, status: 503 })) as Request;

	expect(await checkConnection(defaultOptions, request)).toStrictEqual({
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
	webdav.setRequest((params) => {
		expect(params.method).toBe('PUT');
		expect(params.url).toBe('https://dav.example.com/dav/Notes/file.md');
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
	webdav.setRequest((params) => {
		if (params.method === 'MKCOL') {
			uploadFolderUrl = params.url;
			expect(params.headers).toMatchObject({
				Destination: destination,
			});
			return { ...defaultResponse, status: 201 };
		}
		if (params.method === 'PUT') {
			expect(params.url).toBe(`${uploadFolderUrl}1`);
			expect(params.headers).toMatchObject({
				Destination: destination,
				'OC-Total-Length': '7',
			});
			expect(params.body).toStrictEqual(bytes('abcdefg'));
			return { ...defaultResponse, status: 200 };
		}
		if (params.method === 'MOVE') {
			expect(params.url).toBe(`${uploadFolderUrl}.file`);
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

test('chunked writeStream slices 5 MiB chunks and limits concurrency to 3', async () => {
	const mib = 5 * 1024 * 1024;
	const webdav = createWebdavFs({ chunkedUpload: true });
	const uploads: Array<{ size: number; url: string }> = [];
	const pending: Array<ReturnType<typeof deferred<RequestResponse>>> = [];
	let inFlight = 0;
	let maxInFlight = 0;
	let uploadFolderUrl = '';

	webdav.setRequest((params) => {
		if (params.method === 'MKCOL') {
			uploadFolderUrl = params.url;
			return { ...defaultResponse, status: 201 };
		}
		if (params.method === 'PUT') {
			const body = params.body as Binary;
			uploads.push({ size: body.byteLength, url: params.url });
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			const wait = deferred<RequestResponse>();
			wait.promise
				.finally(() => {
					inFlight -= 1;
				})
				.catch(() => {});
			pending.push(wait);
			return wait.promise;
		}
		if (params.method === 'MOVE') return { ...defaultResponse, headers: { etag: 'big-uid' } };
		throw new Error(`Unexpected method: ${params.method}`);
	});

	const source = createStream([
		filledBinary(mib, 1),
		filledBinary(mib, 2),
		filledBinary(mib, 3),
		filledBinary(1, 4),
	]);
	const writePromise = webdav.fs.writeStream(
		'Notes/big.bin',
		source,
		file('Notes/big.bin', { size: mib * 3 + 1 }),
	);

	await flush(12);
	expect(uploads.map(({ size }) => size)).toStrictEqual([mib, mib, mib]);
	expect(maxInFlight).toBe(3);

	pending[0]?.resolve({ ...defaultResponse, status: 200 });
	await flush(12);
	expect(uploads.map(({ size }) => size)).toStrictEqual([mib, mib, mib, 1]);
	expect(uploads.map(({ url }) => url)).toStrictEqual([
		`${uploadFolderUrl}1`,
		`${uploadFolderUrl}2`,
		`${uploadFolderUrl}3`,
		`${uploadFolderUrl}4`,
	]);

	for (const wait of pending.slice(1)) wait.resolve({ ...defaultResponse, status: 200 });
	expect(await writePromise).toBe('big-uid');
});

test('empty chunked stream skips put and still mkcol move', async () => {
	const webdav = createWebdavFs({ chunkedUpload: true });
	let uploadFolderUrl = '';
	webdav.setRequest((params) => {
		if (params.method === 'MKCOL') {
			uploadFolderUrl = params.url;
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
	webdav.setRequest((params) => {
		if (params.method === 'MKCOL') {
			uploadFolderUrl = params.url;
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
	webdav.setRequest((params) => {
		if (params.method === 'MKCOL') {
			uploadFolderUrl = params.url;
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
		// oxlint-disable-next-line typescript/only-throw-error
		if (attempts === 1) throw { res: { status: 404 } };
		// oxlint-disable-next-line typescript/only-throw-error
		throw { res: { status: 500 } };
	});

	await webdav.fs.delete('Notes/file.md');
	expect(webdav.fs.delete('Notes/file.md')).rejects.toStrictEqual({ res: { status: 500 } });
});

test('mkdir recursively creates parent folders in order', async () => {
	const webdav = createWebdavFs({ endpoint: 'https://dav.example.com/dav' });
	webdav.setRequest((params) => {
		if (params.url === 'https://dav.example.com/dav/Notes/') return response;
		if (params.url === 'https://dav.example.com/dav/Notes/Folder%20A/')
			// oxlint-disable-next-line typescript/only-throw-error
			throw { res: { status: 405 } };
		if (params.url === 'https://dav.example.com/dav/Notes/Folder%20A/Child/') return response;
		throw new Error(`Unexpected URL: ${params.url}`);
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
	webdav.setRequest((params) => {
		if (params.url === 'https://dav.example.com/dav/Notes/') {
			setXmlResponse(rootItems);
			return response;
		}
		if (params.url === 'https://dav.example.com/dav/Notes/Folder%20A/') {
			setXmlResponse(childItems);
			return response;
		}
		throw new Error(`Unexpected URL: ${params.url}`);
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
	webdav.setRequest((params) => {
		if (params.url === 'https://dav.example.com/dav/Notes/') {
			setXmlResponse(rootItems);
			return response;
		}
		throw new Error(`Unexpected recursive request: ${params.url}`);
	});

	const list = await webdav.fs.list('Notes/', ({ current }) =>
		current === 'Notes/Folder A/' ? 'include' : 'exclude',
	);

	expect(list).toStrictEqual([{ isDir: true, key: 'Notes/Folder A/' }]);
	expect(webdav.calls).toHaveLength(1);
});

test('readStream reorders out-of-order ranged responses', async () => {
	const requestRanges: Array<{ start: number; end: number }> = [];
	const resolvers: Array<ReturnType<typeof deferred<Binary>>> = [];
	const toBytes = (buffer: Binary) => [...buffer];

	const stream = createWebDAVReadStream({
		chunkSize: 2,
		maxConcurrent: 3,
		requestRange: (start, end) => {
			requestRanges.push({ end, start });
			const pending = deferred<Binary>();
			resolvers.push(pending);
			return pending.promise;
		},
		size: 6,
	});

	const collected = collectStream(stream);
	await flush();
	expect(requestRanges).toStrictEqual([
		{ end: 1, start: 0 },
		{ end: 3, start: 2 },
		{ end: 5, start: 4 },
	]);

	resolvers[2]?.resolve(filledBinary(2, 3));
	resolvers[0]?.resolve(filledBinary(2, 1));
	resolvers[1]?.resolve(filledBinary(2, 2));

	expect(toBytes(await collected)).toStrictEqual([1, 1, 2, 2, 3, 3]);
});

test('readStream uses 2 MiB ranges from stat size', async () => {
	setXmlResponse([
		{
			href: 'https://dav.example.com/dav/Notes/file.bin',
			propstat: {
				prop: {
					getcontentlength: String(5 * 1024 * 1024 + 1),
					getlastmodified: 'Mon, 01 Jan 2024 00:00:00 GMT',
					resourcetype: {},
				},
				status: 'HTTP/1.1 200 OK',
			},
		},
	]);

	const ranges: Array<string> = [];
	const pending = new Map<string, ReturnType<typeof deferred<RequestResponse>>>();
	const webdav = createWebdavFs({ endpoint: 'https://dav.example.com/dav' });
	webdav.setRequest((params) => {
		if (params.method === 'PROPFIND') return response;
		const range = params.headers?.Range ?? '';
		ranges.push(range);
		const wait = deferred<RequestResponse>();
		pending.set(range, wait);
		return wait.promise;
	});

	const collected = collectStream(
		await webdav.fs.readStream(
			'Notes/file.bin',
			file('Notes/file.bin', { size: 5 * 1024 * 1024 + 1 }),
		),
	);
	await flush();
	expect(ranges).toStrictEqual([
		'bytes=0-2097151',
		'bytes=2097152-4194303',
		'bytes=4194304-5242880',
	]);

	const makeResponse = (byte: number): RequestResponse => ({
		bytes: () => new Uint8Array([byte]),
		headers: {},
		json: () => void 0,
		status: 206,
		text: () => '',
	});

	pending.get('bytes=4194304-5242880')?.resolve(makeResponse(3));
	pending.get('bytes=2097152-4194303')?.resolve(makeResponse(2));
	pending.get('bytes=0-2097151')?.resolve(makeResponse(1));

	await flush();
	expect(ranges).toStrictEqual([
		'bytes=0-2097151',
		'bytes=2097152-4194303',
		'bytes=4194304-5242880',
	]);
	expect(await collected).toStrictEqual(new Uint8Array([1, 2, 3]));
});

test('readStream waits for consumer demand before scheduling', async () => {
	setXmlResponse([
		{
			href: 'https://dav.example.com/dav/Notes/file.bin',
			propstat: {
				prop: {
					getcontentlength: '4',
					getlastmodified: 'Mon, 01 Jan 2024 00:00:00 GMT',
					resourcetype: {},
				},
				status: 'HTTP/1.1 200 OK',
			},
		},
	]);

	const ranges: Array<string> = [];
	const pending = new Map<string, ReturnType<typeof deferred<RequestResponse>>>();
	const webdav = createWebdavFs({ endpoint: 'https://dav.example.com/dav' });
	webdav.setRequest((params) => {
		if (params.method === 'PROPFIND') return response;
		const range = params.headers?.Range ?? '';
		ranges.push(range);
		const wait = deferred<RequestResponse>();
		pending.set(range, wait);
		return wait.promise;
	});

	const stream = await webdav.fs.readStream(
		'Notes/file.bin',
		file('Notes/file.bin', { size: 4 }),
	);
	await flush();
	expect(ranges).toStrictEqual([]);

	const collected = collectStream(stream);
	await flush();
	expect(ranges).toStrictEqual(['bytes=0-3']);
	pending.get('bytes=0-3')?.resolve({
		bytes: () => new Uint8Array([1, 2, 3, 4]),
		headers: {},
		json: () => void 0,
		status: 206,
		text: () => '',
	});
	expect(await collected).toStrictEqual(new Uint8Array([1, 2, 3, 4]));
});
