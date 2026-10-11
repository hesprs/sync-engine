// oxlint-disable import/no-nodejs-modules no-console
// Run with packages/s3-rclone/test/mocks.ts preloaded; credentials come from environment.
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat as diskStat, utimes, writeFile } from 'node:fs/promises';
import type {
	Binary,
	FileStat,
	Fs,
	Request,
	Stat,
	RecordStatsMap,
} from '../packages/plugin/dist/index.spec';
import MetadataRemoteFs, {
	RemoteSession,
	remoteMiddleware,
	UploadRemoteFs,
} from '../packages/s3-rclone/src/remote';
import { getTarget, header } from '../packages/s3-rclone/src/target';
import { decide } from '../packages/s3-rclone/test/s3-harness';
import createVault from '../packages/s3-rclone/test/vault';

function env(key: string) {
	const value = Bun.env[key];
	if (!value) throw new Error(`Set ${key} before running this verification.`);
	return value;
}

const config = {
	accessKeyId: env('S3_RCLONE_ACCESS_KEY_ID'),
	bucket: 'test-files',
	endpoint: 'http://127.0.0.1:23801',
	fetchObjectMeta: true,
	region: 'us-east-1',
	secretAccessKey: env('S3_RCLONE_SECRET_ACCESS_KEY'),
	urlStyle: 'path',
};
const target = getTarget({ modules: { s3: config }, remoteFs: 's3' });
assert.ok(target);
const { default: S3Fs } = (await import(
	new URL('../packages/s3/src/s3/fs.ts', import.meta.url).href
)) as {
	default: new (
		options: Record<string, unknown>,
	) => Fs & { batchDelete: (keys: Array<string>) => Promise<Record<string, Error>> };
};
const { sigv4Middleware } = (await import(
	new URL('../packages/s3/src/s3/sigv4.ts', import.meta.url).href
)) as {
	sigv4Middleware: (
		request: Request,
		config: Record<string, string>,
		db: { getMeta: (key: string) => unknown; setMeta: (key: string, value: unknown) => void },
	) => Request;
};
const { prefixWrapper } = (await import(
	new URL('../packages/plugin/dist/index.js', import.meta.url).href
)) as {
	prefixWrapper: (fs: Fs, prefix: string) => Fs;
};
const { testKit } = (await import(
	new URL('../packages/plugin/dist/dev.js', import.meta.url).href
)) as typeof import('../packages/plugin/dist/dev.spec');
const { default: encryptionWrapper } = (await import(
	new URL('../packages/encryption/src/wrapper/index.ts', import.meta.url).href
)) as {
	default: (fs: Fs, options: Record<string, unknown>) => Fs;
};

function memoryDB() {
	const meta = new Map<string, unknown>();
	const stores = new Map<string, Map<string, string>>();
	return {
		getMeta: (key: string) => meta.get(key),
		getStore: (name: string) => {
			const store = stores.get(name) ?? new Map<string, string>();
			stores.set(name, store);
			return {
				clear: () => {
					store.clear();
				},
				delete: (key: string) => store.delete(key),
				get: (key: string) => store.get(key),
				keys: () => [...store.keys()],
				set: (key: string, value: string) => {
					store.set(key, value);
				},
			};
		},
		setMeta: (key: string, value: unknown) => {
			meta.set(key, value);
		},
	};
}

const runId = crypto.randomUUID();
const localRoot = new URL(`../test-files/s3-rclone-${runId}/`, import.meta.url).pathname;
const reports: Array<object> = [];
const issues: Array<object> = [];
await mkdir(localRoot, { recursive: true });
try {
	for (const encrypted of [false, true]) {
		const prefix = `s3-rclone-${runId}/${encrypted ? 'encrypted' : 'plain'}/`;
		let fastMode = false;
		let preferMetadataMtime = false;
		let cancelParts = false;
		let abortFinished: Promise<unknown> | undefined;
		const calls: Array<{
			method: string;
			url: string;
			mtime?: string;
			signedTime: boolean;
			status: number;
		}> = [];
		const transport: Request = async (url, params = {}) => {
			const method = params.method ?? 'GET';
			const query = new URL(url).searchParams;
			if (cancelParts && query.has('partNumber'))
				throw new Error('Verification cancellation');
			const fetchResult = fetch(url, { body: params.body, headers: params.headers, method });
			if (method === 'DELETE' && query.has('uploadId')) abortFinished = fetchResult;
			const response = await fetchResult;
			const bytes = new Uint8Array(await response.arrayBuffer());
			const text = new TextDecoder().decode(bytes);
			calls.push({
				method,
				mtime: header(params.headers ?? {}, 'x-amz-meta-mtime'),
				signedTime:
					header(params.headers ?? {}, 'authorization')?.includes('x-amz-meta-mtime') ??
					false,
				status: response.status,
				url,
			});
			return {
				bytes: () => bytes,
				headers: Object.fromEntries(response.headers),
				json: () => JSON.parse(text) as never,
				status: response.status,
				text: () => text,
			};
		};
		const db = memoryDB();
		const signed = sigv4Middleware(
			transport,
			{
				accessKeyId: config.accessKeyId,
				region: config.region,
				secretAccessKey: config.secretAccessKey,
				service: 's3',
			},
			db,
		);
		const session: RemoteSession = new RemoteSession(
			target,
			() => true,
			() => preferMetadataMtime,
			{ encryptedMetadata: () => encrypted, fastMode: () => fastMode },
		);
		const pagedSigned: Request = (url, params) => {
			const query = new URL(url);
			if (query.searchParams.has('list-type')) query.searchParams.set('max-keys', '1');
			return signed(query.href, params);
		};
		const raw = new S3Fs({ ...config, request: remoteMiddleware(pagedSigned, session) });
		const originalStat = (Object.getPrototypeOf(raw) as Fs).stat;
		let wrapped: Fs = prefixWrapper(new UploadRemoteFs(raw, session), prefix);
		if (encrypted)
			wrapped = encryptionWrapper(wrapped, {
				memoryDB: db,
				password: 's3-rclone-verification',
			});
		const remote: Fs = new MetadataRemoteFs(wrapped, session);
		const inputs: Array<[string, Binary]> = [
			['笔记 #%.md', testKit.bytes('S3 rclone verification\n')],
			['empty.md', new Uint8Array()],
			['ThisIsAnEmptyFolderInTheS3Bucket', new Uint8Array()],
			['nested/child/note.md', testKit.bytes('Nested note\n')],
			['large.bin', new Uint8Array(6 * 1024 * 1024).map((_, i) => i % 251)],
		];
		const sources: Array<FileStat> = [];
		const uids = new Map<string, string>();
		const mtime = 1_700_000_123_456;
		const ctime = 1_500_000_000_000;
		try {
			const begin = calls.length;
			await remote.mkdir('nested/child/', testKit.folder('nested/child/'), true);
			await remote.mkdir('empty-directory/', testKit.folder('empty-directory/'));
			assert.equal(calls.length, begin, 'mkdir must not upload directory markers');
			for (const [key, value] of inputs) {
				const path = `${localRoot}${encrypted ? 'encrypted' : 'plain'}/${key}`;
				await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
				await writeFile(path, value);
				await utimes(path, new Date(), new Date(mtime));
				assert.equal((await diskStat(path)).mtimeMs, mtime);
				const source = testKit.file(key, {
					meta: () => ({
						ctime: String(ctime),
						custom: 'retained',
						mtime: String(mtime),
					}),
					mtime,
					size: value.length,
				});
				sources.push(source);
				fastMode = false;
				const uid =
					key === 'large.bin'
						? await remote.writeStream(key, Bun.file(path).stream(), source)
						: await remote.write(key, new Uint8Array(await readFile(path)), source);
				uids.set(key, uid);
			}
			const listed: Array<Stat> = await remote.list('/', () => 'advance');
			assert.deepEqual(
				listed.map(({ key }) => key).sort(),
				[...inputs.map(([key]) => key), 'nested/', 'nested/child/'].sort(),
			);
			for (const stat of listed) if (!stat.isDir) assert.equal(stat.uid, uids.get(stat.key));
			const records: RecordStatsMap = new Map(
				listed.map((stat) => [
					stat.key,
					stat.isDir
						? { isDir: true as const }
						: {
								isDir: false as const,
								local: sources.find((source) => source.key === stat.key)?.uid ?? '',
								remote: stat.uid,
							},
				]),
			);
			assert.deepEqual(
				await decide(
					[...sources, testKit.folder('nested/'), testKit.folder('nested/child/')],
					listed,
					records,
				),
				[],
				'Second sync must have no tasks',
			);
			for (const mode of [false, true]) {
				fastMode = mode;
				for (const [key] of inputs) {
					const start = calls.length;
					const stat = await remote.stat(key);
					assert.ok(!stat.isDir);
					if (stat.uid !== uids.get(key))
						issues.push({
							encrypted,
							headUid: stat.uid,
							key,
							listingUid: uids.get(key),
							operation: 'HEAD identity',
						});
					assert.deepEqual(
						calls.slice(start).map(({ method }) => method),
						[mode ? 'HEAD' : 'GET'],
					);
				}
			}
			for (const preference of [false, true]) {
				preferMetadataMtime = preference;
				const vault = await createVault();
				for (const [key, value] of inputs) {
					const stat = listed.find(
						(entry): entry is FileStat => entry.key === key && !entry.isDir,
					);
					assert.ok(stat);
					await (key === 'large.bin'
						? vault.fs.writeStream(key, await remote.readStream(key, stat), stat)
						: vault.fs.write(key, await remote.read(key, stat), stat));
					const downloaded = vault.files.get(key);
					assert.ok(downloaded);
					assert.deepEqual(downloaded.value, value);
					assert.equal(downloaded.mtime, preference ? mtime : stat.mtime);
					assert.equal(downloaded.ctime, ctime);
					assert.equal((await stat.meta()).custom, 'retained');
				}
			}
			fastMode = true;
			for (const key of ['笔记 #%.md', 'large.bin']) {
				const value = inputs.find(([name]) => name === key)?.[1];
				assert.ok(value);
				const source = testKit.file(key, {
					meta: () => ({
						ctime: String(ctime),
						custom: 'retained',
						mtime: String(mtime),
					}),
					size: value.length,
				});
				const uid =
					key === 'large.bin'
						? await remote.writeStream(key, testKit.stream([value]), source)
						: await remote.write(key, value, source);
				fastMode = false;
				const actual = await remote.stat(key);
				assert.ok(!actual.isDir);
				if (uid !== actual.uid)
					issues.push({
						encrypted,
						headUid: uid,
						key,
						listingUid: actual.uid,
						operation: 'fast upload confirmation',
					});
				fastMode = true;
			}
			await remote.move('笔记 #%.md', 'nested/moved.md');
			assert.equal(await remote.exists('笔记 #%.md'), false);
			const moved = await remote.stat('nested/moved.md');
			assert.ok(!moved.isDir);
			assert.deepEqual(await remote.read('nested/moved.md', moved), inputs[0][1]);
			cancelParts = true;
			await assert.rejects(
				Promise.resolve(
					remote.writeStream(
						'cancelled.bin',
						testKit.stream([new Uint8Array(6 * 1024 * 1024)]),
						testKit.file('cancelled.bin', {
							meta: () => ({ mtime: String(mtime) }),
							size: 6 * 1024 * 1024,
						}),
					),
				),
				/Verification cancellation/u,
			);
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 30);
			});
			await abortFinished;
			cancelParts = false;
			assert.equal(await remote.exists('cancelled.bin'), false);
			assert.equal(session.uploads.size, 0);
			assert.ok(
				calls.some((call) => call.mtime === String(mtime / 1000) && call.signedTime),
				'Time header must be signed',
			);
			assert.ok(
				calls.some(
					(call) =>
						call.method === 'DELETE' && new URL(call.url).searchParams.has('uploadId'),
				),
				'Cancellation must abort multipart',
			);
			reports.push({
				encrypted,
				files: inputs.length,
				multipartBytes: inputs.at(-1)?.[1].length,
				queryModes: ['listing', 'HEAD'],
				requests: calls.length,
				secondSyncTasks: 0,
			});
		} finally {
			cancelParts = false;
			const remaining = await raw.list(prefix, () => 'advance');
			const errors = await raw.batchDelete(
				remaining.filter((stat) => !stat.isDir).map(({ key }) => key),
			);
			assert.deepEqual(errors, {}, 'Batch cleanup must succeed');
			const after = await raw.list(prefix, () => 'advance');
			assert.deepEqual(after, [], 'Verification prefix must be empty');
			session.clear();
			assert.equal(raw.stat, originalStat);
			assert.equal(session.downloadedMeta.size, 0);
		}
	}
	console.log(
		JSON.stringify(
			{
				bucket: config.bucket,
				cleaned: true,
				endpoint: config.endpoint,
				issues,
				results: reports,
			},
			undefined,
			2,
		),
	);
	if (issues.length) process.exitCode = 1;
} finally {
	await rm(localRoot, { force: true, recursive: true });
}
