import type {
	Binary,
	InputAtom,
	OptimizerInput,
	Request,
	RequestParam,
	RequestResponse,
} from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, mock, test } from 'bun:test';
import type { S3FsOptions } from '@/s3/fs';
import s3BatchDeleteOptimizer from '@/optimizer';
import S3Fs from '@/s3/fs';
import { sigv4Middleware } from '@/s3/sigv4';
import {
	defaultCredentials,
	defaultResponse,
	defaultS3Options,
	memoryDB,
	response,
} from './helpers';

const { bytes, deferred, file, stream: createStream } = testKit;

let parsedResponse: unknown = {};

void mock.module('@repo/shared/parse-xml', () => ({
	default: () => parsedResponse,
}));

type RequestHandler = (params: RequestParam) => RequestResponse | Promise<RequestResponse>;
type S3Harness = {
	calls: Array<RequestParam>;
	fs: S3Fs;
	setRequest: (handler: RequestHandler) => void;
};

const defaultOptions = {
	...defaultS3Options,
} as const satisfies Omit<S3FsOptions, 'request'>;

function createS3Fs(options: Partial<S3FsOptions> = {}): S3Harness {
	const calls: Array<RequestParam> = [];
	let requestHandler: RequestHandler = () => Promise.resolve(defaultResponse);
	const transport: Request = (params) =>
		Promise.resolve().then(() => {
			if (typeof params === 'string') throw new Error(`Unexpected string request: ${params}`);
			calls.push(params);
			return requestHandler(params);
		});
	const request = sigv4Middleware(transport, defaultCredentials, memoryDB);
	return {
		calls,
		fs: new S3Fs({ ...defaultOptions, ...options, request }),
		setRequest: (handler) => {
			requestHandler = handler;
		},
	};
}

function assertSignedRequest(params: RequestParam, method: string) {
	expect(params.method).toBe(method);
	expect(params.headers).toMatchObject({
		'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
	});
	expect(params.headers?.['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/u);
	expect(params.headers?.authorization).toMatch(
		/^AWS4-HMAC-SHA256 Credential=access-key\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=.*?, Signature=[0-9a-f]{64}$/u,
	);
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
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

function textBody(params: RequestParam): string {
	return new TextDecoder().decode(params.body as Binary);
}

test('read gets encoded object bytes and maps S3 XML errors', async () => {
	const s3 = createS3Fs();
	s3.setRequest((params) => {
		assertSignedRequest(params, 'GET');
		expect(params.url).toBe('https://s3.example.com/vault/Notes/file%20A.md');
		return response({ body: bytes('content') });
	});
	expect(await s3.fs.read('Notes/file A.md')).toStrictEqual(bytes('content'));

	const errorFs = createS3Fs();
	errorFs.setRequest(() =>
		response({
			status: 404,
			text: '<Error><Code>NoSuchKey</Code><Message>missing object</Message></Error>',
		}),
	);
	parsedResponse = { Error: { Code: 'NoSuchKey', Message: 'missing object' } };
	expect(errorFs.fs.read('missing')).rejects.toMatchObject({
		message: 'S3 NoSuchKey: missing object',
		status: 404,
	});
});

test('write sends binary PUT and uses ETag or HEAD metadata fallback', async () => {
	const s3 = createS3Fs();
	s3.setRequest((params) => {
		assertSignedRequest(params, 'PUT');
		expect(params.url).toBe('https://s3.example.com/vault/Notes/file.md');
		expect(params.headers?.['Content-Type']).toBe('application/octet-stream');
		expect(params.body).toStrictEqual(bytes('hello'));
		return response({ headers: { ETag: '"write-etag"' } });
	});
	expect(await s3.fs.write('Notes/file.md', bytes('hello'))).toBe('"write-etag"');

	const fallback = createS3Fs();
	fallback.setRequest((params) => {
		if (params.method === 'PUT') return defaultResponse;
		expect(params.method).toBe('HEAD');
		return response({
			headers: {
				'content-length': '5',
				'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT',
			},
		});
	});
	expect(await fallback.fs.write('Notes/file.md', bytes('hello'))).toBe(
		`${new Date('Mon, 01 Jan 2024 00:00:00 GMT').valueOf()}~5`,
	);
});

test('readStream requests 2 MiB ranges and emits responses in file order', async () => {
	const mib = 1024 * 1024;
	const pending = new Map<string, ReturnType<typeof deferred<RequestResponse>>>();
	const scheduled = deferred<void>();
	const s3 = createS3Fs();
	s3.setRequest((params) => {
		const range = params.headers?.Range;
		if (!range) throw new Error('Expected range');
		const wait = deferred<RequestResponse>();
		pending.set(range, wait);
		if (pending.size === 3) scheduled.resolve();
		return wait.promise;
	});
	const stream = await s3.fs.readStream(
		'Notes/file.bin',
		file('Notes/file.bin', { size: 5 * mib + 1 }),
	);
	const collected = collectStream(stream);
	await scheduled.promise;
	expect(new Set(s3.calls.map((call) => call.headers?.Range))).toStrictEqual(
		new Set(['bytes=0-2097151', 'bytes=2097152-4194303', 'bytes=4194304-5242880']),
	);
	for (const [range, value] of [
		['bytes=4194304-5242880', 3],
		['bytes=2097152-4194303', 2],
		['bytes=0-2097151', 1],
	] as const)
		pending.get(range)?.resolve(response({ body: new Uint8Array([value]), status: 206 }));
	expect(await collected).toStrictEqual(new Uint8Array([1, 2, 3]));
});

test('readStream handles empty files and ranged request errors', async () => {
	const empty = createS3Fs();
	const emptyStream = await empty.fs.readStream('empty', file('empty', { size: 0 }));
	expect(await collectStream(emptyStream)).toStrictEqual(new Uint8Array(0));
	expect(empty.calls).toHaveLength(0);

	const requestError = new Error('range failed');
	const failed = createS3Fs();
	failed.setRequest(() => {
		throw requestError;
	});
	const stream = await failed.fs.readStream('file', file('file', { size: 1 }));
	expect(collectStream(stream)).rejects.toBe(requestError);
});

test('writeStream buffers below-part-size input into one PUT', async () => {
	const s3 = createS3Fs();
	s3.setRequest((params) => {
		expect(params.method).toBe('PUT');
		expect(params.body).toStrictEqual(bytes('hello world'));
		return response({ headers: { etag: 'buffered-etag' } });
	});
	const source = createStream([bytes('hello '), bytes('world')]);
	const destination = file('Notes/file.md', { size: 11 });
	const uid = await s3.fs.writeStream('Notes/file.md', source, destination);
	expect(uid).toBe('buffered-etag');
	expect(s3.calls).toHaveLength(1);
});

test('writeStream uploads exact multipart parts and completes with ETag', async () => {
	const partSize = 5 * 1024 * 1024;
	const s3 = createS3Fs();
	s3.setRequest((params) => {
		const url = new URL(params.url);
		if (params.method === 'POST' && url.searchParams.has('uploads')) {
			expect(params.headers?.['x-amz-content-sha256']).toBe('UNSIGNED-PAYLOAD');
			parsedResponse = { InitiateMultipartUploadResult: { UploadId: 'upload-1' } };
			return response({
				text: '<InitiateMultipartUploadResult><UploadId>upload-1</UploadId></InitiateMultipartUploadResult>',
			});
		}
		if (params.method === 'PUT') {
			expect(url.searchParams.get('uploadId')).toBe('upload-1');
			expect(params.headers?.['Content-Type']).toBe('application/octet-stream');
			const partNumber = url.searchParams.get('partNumber');
			expect(params.body).toStrictEqual(
				partNumber === '1' ? new Uint8Array(partSize).fill(1) : new Uint8Array([2, 2]),
			);
			return response({ headers: { etag: `part-${partNumber}` } });
		}
		expect(params.method).toBe('POST');
		expect(url.searchParams.get('uploadId')).toBe('upload-1');
		expect(params.headers?.['Content-Type']).toBe('application/xml');
		expect(textBody(params)).toContain('<PartNumber>1</PartNumber><ETag>part-1</ETag>');
		expect(textBody(params)).toContain('<PartNumber>2</PartNumber><ETag>part-2</ETag>');
		parsedResponse = { CompleteMultipartUploadResult: { ETag: 'complete-etag' } };
		return response({
			text: '<CompleteMultipartUploadResult><ETag>complete-etag</ETag></CompleteMultipartUploadResult>',
		});
	});

	const uid = await s3.fs.writeStream(
		'Notes/big.bin',
		createStream([new Uint8Array(partSize).fill(1), new Uint8Array([2, 2])]),
		file('Notes/big.bin', { size: partSize + 2 }),
	);
	expect(uid).toBe('complete-etag');
	expect(s3.calls.map(({ method }) => method)).toStrictEqual(['POST', 'PUT', 'PUT', 'POST']);
});

test('writeStream aborts multipart upload after part failure', () => {
	const s3 = createS3Fs();
	const uploadError = new Error('part failed');
	s3.setRequest((params) => {
		const url = new URL(params.url);
		if (params.method === 'POST' && url.searchParams.has('uploads')) {
			parsedResponse = { InitiateMultipartUploadResult: { UploadId: 'upload-2' } };
			return response({
				text: '<InitiateMultipartUploadResult><UploadId>upload-2</UploadId></InitiateMultipartUploadResult>',
			});
		}
		if (params.method === 'PUT') throw uploadError;
		expect(params.method).toBe('DELETE');
		expect(url.searchParams.get('uploadId')).toBe('upload-2');
		return response({ status: 204 });
	});

	const source = createStream([bytes('failed')]);
	const destination = file('failed.bin', { size: 5 * 1024 * 1024 });
	expect(s3.fs.writeStream('failed.bin', source, destination)).rejects.toBe(uploadError);
	expect(s3.calls.map(({ method }) => method)).toStrictEqual(['POST', 'PUT', 'DELETE']);
});

test('delete and exists treat 404 as absent but propagate other statuses', async () => {
	const calls: Array<string> = [];
	const s3 = createS3Fs();
	s3.setRequest((params) => {
		calls.push(params.method ?? '');
		if (calls.length === 1 || calls.length === 3) return response({ status: 404 });
		return response({ status: 500, text: '<Error><Code>InternalError</Code></Error>' });
	});
	await s3.fs.delete('gone');
	expect(s3.fs.delete('broken')).rejects.toMatchObject({ status: 500 });
	expect(await s3.fs.exists('missing')).toBe(false);
	expect(s3.fs.exists('broken')).rejects.toMatchObject({ status: 500 });

	const root = createS3Fs();
	expect(await root.fs.exists('/')).toBe(true);
});

test('batchDelete escapes keys, sends MD5 XML, and batches at 1000 keys', async () => {
	const s3 = createS3Fs();
	const bodies: Array<string> = [];
	s3.setRequest((params) => {
		expect(params.method).toBe('POST');
		const url = new URL(params.url);
		expect(url.searchParams.has('delete')).toBe(true);
		expect(params.headers?.['Content-Type']).toBe('application/xml');
		expect(params.headers?.['Content-MD5']).toMatch(/^[A-Za-z0-9+/]{22}==$/u);
		parsedResponse =
			bodies.length === 0
				? {
						DeleteResult: {
							Error: {
								Code: 'AccessDenied',
								Key: 'a<&"\'',
								Message: 'no permission',
							},
						},
					}
				: {};
		bodies.push(textBody(params));
		return response({
			status: 200,
			text: '<DeleteResult><Error><Key>a&lt;&amp;&quot;&apos;</Key><Code>AccessDenied</Code><Message>no permission</Message></Error></DeleteResult>',
		});
	});
	const keys = ['a<&"\''];
	for (let index = 0; index < 1000; index += 1) keys.push(`key-${index}`);
	const result = await s3.fs.batchDelete(keys);
	expect(bodies).toHaveLength(2);
	expect(bodies[0]).toContain('<Key>a&lt;&amp;&quot;&apos;</Key>');
	expect((bodies[0]?.match(/<Object>/gu) ?? []).length).toBe(1000);
	expect((bodies[1]?.match(/<Object>/gu) ?? []).length).toBe(1);
	expect(result['a<&"\'']).toBe('S3 AccessDenied: no permission');
	expect(result['key-0']).toBe(true);
});

test('batch delete rejects only atoms with S3 partial failures', async () => {
	const s3 = createS3Fs();
	s3.setRequest(() => {
		parsedResponse = {
			DeleteResult: {
				Error: { Code: 'AccessDenied', Key: 'blocked.md', Message: 'not allowed' },
			},
		};
		return response({
			text: '<DeleteResult><Error><Key>blocked.md</Key><Code>AccessDenied</Code><Message>not allowed</Message></Error></DeleteResult>',
		});
	});

	const status = new Map<string, string>();
	const atoms: Array<InputAtom> = ['ok.md', 'blocked.md'].map((key) => ({
		execute: () => {},
		key,
		reject: (error) => status.set(key, `rejected: ${error.message}`),
		resolve: () => status.set(key, 'resolved'),
		type: 'delete',
	}));
	const optimized = s3BatchDeleteOptimizer({
		atoms,
		executeAtom: (atom) => Promise.resolve(atom.execute()),
		fs: s3.fs,
	} satisfies OptimizerInput);
	const batch = optimized?.[0];
	if (!batch) throw new Error('Expected batch delete atom');
	await batch.execute();

	expect(status).toStrictEqual(
		new Map([
			['ok.md', 'resolved'],
			['blocked.md', 'rejected: S3 AccessDenied: not allowed'],
		]),
	);
});

test('move copies encoded source before deleting old key', async () => {
	const s3 = createS3Fs();
	s3.setRequest((params) => {
		if (params.method === 'PUT') {
			expect(params.url).toBe('https://s3.example.com/vault/new%20folder/new.md');
			expect(params.headers).toMatchObject({
				'Content-Type': 'application/octet-stream',
				'x-amz-copy-source': 'vault/old%20folder/old.md',
			});
			return defaultResponse;
		}
		expect(params.method).toBe('DELETE');
		expect(params.url).toBe('https://s3.example.com/vault/old%20folder/old.md');
		return defaultResponse;
	});
	await s3.fs.move('old folder/old.md', 'new folder/new.md');
	expect(s3.calls.map(({ method }) => method)).toStrictEqual(['PUT', 'DELETE']);
});

test('mkdir recursively creates placeholders in ancestor order and ignores conflicts', async () => {
	const s3 = createS3Fs();
	s3.setRequest((params) => {
		expect(params.method).toBe('PUT');
		expect(params.headers?.['Content-Type']).toBe('application/octet-stream');
		expect(params.body).toStrictEqual(new Uint8Array(0));
		// oxlint-disable-next-line typescript/only-throw-error
		if (params.url.endsWith('/Notes/A%20B/')) throw { res: { status: 409 } };
		return response({ status: 201 });
	});
	await s3.fs.mkdir('Notes/A B/Child/', true);
	expect(s3.calls.map(({ url }) => url)).toStrictEqual([
		'https://s3.example.com/vault/Notes/',
		'https://s3.example.com/vault/Notes/A%20B/',
		'https://s3.example.com/vault/Notes/A%20B/Child/',
	]);
});

test('stat returns root, folder placeholders, and file metadata with ETag fallback', async () => {
	const s3 = createS3Fs();
	expect(await s3.fs.stat('/')).toStrictEqual({ isDir: true, key: '/' });
	s3.setRequest((params) => {
		expect(params.method).toBe('HEAD');
		if (params.url.endsWith('/folder/'))
			return response({ headers: { 'content-length': '0' } });
		return response({
			headers: {
				'content-length': '12',
				'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT',
			},
		});
	});
	expect(await s3.fs.stat('folder/')).toStrictEqual({ isDir: true, key: 'folder/' });
	expect(await s3.fs.stat('note.md')).toStrictEqual({
		isDir: false,
		key: 'note.md',
		mtime: new Date('Mon, 01 Jan 2024 00:00:00 GMT').valueOf(),
		size: 12,
		uid: `${new Date('Mon, 01 Jan 2024 00:00:00 GMT').valueOf()}~12`,
	});
});

test('list returns files and prefixes, excludes queried key, reports exclusions, and paginates', async () => {
	const s3 = createS3Fs();
	const progress: Array<string> = [];
	s3.setRequest((params) => {
		const url = new URL(params.url);
		expect(params.method).toBe('GET');
		expect(url.searchParams.get('list-type')).toBe('2');
		expect(url.searchParams.has('delimiter')).toBe(false);
		expect(url.searchParams.get('prefix')).toBe('Notes/');
		if (url.searchParams.has('continuation-token')) {
			expect(url.searchParams.get('continuation-token')).toBe('next-page');
			parsedResponse = {
				ListBucketResult: {
					Contents: {
						ETag: 'etag-2',
						Key: 'Notes/second.md',
						LastModified: 'Mon, 01 Jan 2024 00:00:00 GMT',
						Size: '2',
					},
					IsTruncated: 'false',
				},
			};
			return response({
				text: '<ListBucketResult><Contents><Key>Notes/second.md</Key><Size>2</Size><ETag>etag-2</ETag></Contents><IsTruncated>false</IsTruncated></ListBucketResult>',
			});
		}
		parsedResponse = {
			ListBucketResult: {
				Contents: [
					{ Key: 'Notes/' },
					{
						ETag: 'etag-1',
						Key: 'Notes/first.md',
						LastModified: 'Mon, 01 Jan 2024 00:00:00 GMT',
						Size: '1',
					},
					{ Key: 'Notes/folder/' },
				],
				IsTruncated: 'true',
				NextContinuationToken: 'next-page',
			},
		};
		return response({
			text: '<ListBucketResult><Contents><Key>Notes/</Key><Size>0</Size></Contents><Contents><Key>Notes/first.md</Key><Size>1</Size><ETag>etag-1</ETag><LastModified>Mon, 01 Jan 2024 00:00:00 GMT</LastModified></Contents><Contents><Key>Notes/folder/</Key></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>next-page</NextContinuationToken></ListBucketResult>',
		});
	});

	const result = await s3.fs.list('Notes/', ({ current }) => {
		progress.push(current);
		return current === 'Notes/first.md' ? 'exclude' : 'include';
	});
	expect(result).toStrictEqual([
		{ isDir: true, key: 'Notes/folder/' },
		{
			isDir: false,
			key: 'Notes/second.md',
			mtime: expect.any(Number) as never,
			size: 2,
			uid: 'etag-2',
		},
	]);
	expect(progress).toStrictEqual(['Notes/first.md', 'Notes/folder/', 'Notes/second.md']);
	expect(s3.calls).toHaveLength(2);
});

test('list maps unified root to an empty S3 prefix', async () => {
	const s3 = createS3Fs();
	s3.setRequest((params) => {
		expect(new URL(params.url).searchParams.get('prefix')).toBe('');
		parsedResponse = { ListBucketResult: { IsTruncated: 'false' } };
		return response({ text: '<ListBucketResult />' });
	});

	expect(await s3.fs.list('/', () => 'include' as const)).toStrictEqual([]);
});
