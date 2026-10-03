// oxlint-disable import/no-nodejs-modules no-console
// Run with the module's test preload. Credentials are read only from environment.
import assert from 'node:assert/strict';
import { appendFile, mkdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import type {
	Binary,
	BaseTask,
	DeciderInput,
	FileStat,
	Fs,
	RecordStatsMap,
	Request,
	Stat,
	VaultRequest,
} from '../packages/plugin/dist/index.spec';
import MetadataLocalFs, {
	LocalSession,
	localMiddleware,
} from '../packages/openlist-file-metadata/src/local';
import MetadataRemoteFs, {
	RemoteSession,
	remoteMiddleware,
} from '../packages/openlist-file-metadata/src/remote';
import { getTarget, header } from '../packages/openlist-file-metadata/src/target';
import { attachTimes, getTimes } from '../packages/openlist-file-metadata/src/times';

function env(key: string) {
	const value = Bun.env[key];
	if (!value) throw new Error(`Set ${key} before running this verification.`);
	return value;
}

async function loadFs(source: string) {
	return (
		(await import(new URL(source, import.meta.url).href)) as {
			default: new (options: Record<string, unknown>) => Fs;
		}
	).default;
}

const { default: VaultFs } = (await import(
	new URL('../packages/plugin/src/fs/vault/index.ts', import.meta.url).href
)) as {
	default: new (request: VaultRequest, name: string) => Fs;
};
const { default: prefixWrapper } = (await import(
	new URL('../packages/plugin/src/sdk/prefix.ts', import.meta.url).href
)) as {
	default: (fs: Fs, prefix: string) => Fs;
};
const { sigv4Middleware } = (await import(
	new URL('../packages/s3/src/s3/sigv4.ts', import.meta.url).href
)) as {
	sigv4Middleware: (
		request: Request,
		config: Record<string, string>,
		db: {
			getMeta: (key: string) => unknown;
			setMeta: (key: string, value: unknown) => void;
		},
	) => Request;
};
const { testKit } = (await import(
	new URL('../packages/plugin/dist/dev.js', import.meta.url).href
)) as {
	testKit: {
		runDecider: (
			decider: (input: DeciderInput) => Array<BaseTask>,
			input: {
				localStats: Map<string, Stat>;
				remoteStats: Map<string, Stat>;
				records: RecordStatsMap;
			},
		) => Array<{ key: string; name: string }>;
	};
};
const { default: decider } = (await import(
	new URL('../packages/plugin/src/sync/decision/bidirectional.ts', import.meta.url).href
)) as {
	default: (input: DeciderInput, logger: (message: string) => void) => Array<BaseTask>;
};

const report: Array<object> = [];
const runId = crypto.randomUUID();
const localRoot = `${import.meta.dir}/../test-files/openlist-file-metadata-${runId}`;
await mkdir(localRoot, { recursive: true });

async function diskFs(root: string) {
	await mkdir(root, { recursive: true });
	const requested = new Map<string, { ctime?: number; mtime?: number }>();
	const path = (key: string) => `${root}/${key === '/' ? '' : key.replace(/\/$/u, '')}`;
	const request: VaultRequest = async (key, params) => {
		const name = path(key);
		if (!params || params.method === 'GET')
			return new Uint8Array(await readFile(name)) as never;
		if (params.method === 'GET_STREAM') return Bun.file(name).stream() as never;
		if (params.method === 'STAT') {
			const info = await stat(name);
			return {
				ctime: info.birthtimeMs,
				mtime: info.mtimeMs,
				size: info.size,
				type: info.isDirectory() ? 'folder' : 'file',
			} as never;
		}
		if (params.method === 'EXISTS')
			return (await stat(name).then(
				() => true,
				() => false,
			)) as never;
		if (params.method === 'MKDIR') await mkdir(name, { recursive: true });
		if (params.method === 'PUT' || params.method === 'APPEND') {
			await (params.method === 'PUT' ? writeFile : appendFile)(name, params.value);
			if (params.mtime !== undefined) await utimes(name, new Date(), new Date(params.mtime));
			requested.set(key, { ctime: params.ctime, mtime: params.mtime });
		}
		if (params.method === 'DELETE') await rm(name, { force: true, recursive: true });
		if (params.method === 'MOVE') {
			await rename(name, path(params.destination));
			const times = requested.get(key);
			if (times) requested.set(params.destination, times);
			requested.delete(key);
		}
		return undefined as never;
	};
	const session = new LocalSession(() => true);
	return {
		fs: new MetadataLocalFs(new VaultFs(localMiddleware(request, session), root), session),
		requested,
	};
}

for (const kind of ['s3', 'webdav'] as const) {
	const endpoint = env(kind === 's3' ? 'OPENLIST_S3_ENDPOINT' : 'OPENLIST_DAV_ENDPOINT');
	const config =
		kind === 's3'
			? {
					accessKeyId: env('OPENLIST_S3_ACCESS_KEY'),
					bucket: env('OPENLIST_S3_BUCKET'),
					endpoint,
					region: 'us-east-1',
					secretAccessKey: env('OPENLIST_S3_SECRET_KEY'),
					urlStyle: 'path',
				}
			: {
					endpoint,
					password: env('OPENLIST_DAV_PASSWORD'),
					username: env('OPENLIST_DAV_USERNAME'),
				};
	const target = getTarget({ modules: { [kind]: config }, remoteFs: kind });
	assert.ok(target);
	const prefix = `openlist-file-metadata-${kind}-${runId}/`;
	const Root = await loadFs(
		kind === 's3' ? '../packages/s3/src/s3/fs.ts' : '../packages/webdav/src/webdav/fs.ts',
	);
	const requests: Array<{ method: string; mtime?: string }> = [];
	const transport: Request = async (url, params = {}) => {
		requests.push({
			method: params.method ?? 'GET',
			mtime:
				header(params.headers ?? {}, 'x-amz-meta-mtime') ??
				header(params.headers ?? {}, 'x-oc-mtime'),
		});
		const response = await fetch(url, {
			body: params.body,
			headers: params.headers,
			method: params.method,
		});
		const bytes = new Uint8Array(await response.arrayBuffer());
		const text = new TextDecoder().decode(bytes);
		if (params.throw !== false && response.status >= 400)
			throw Object.assign(new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`), {
				status: response.status,
			});
		return {
			bytes: () => bytes,
			headers: Object.fromEntries(response.headers),
			json: () => JSON.parse(text) as never,
			status: response.status,
			text: () => text,
		};
	};
	const createRemote = () => {
		const metadata = new Map<string, unknown>();
		const signed =
			kind === 's3'
				? sigv4Middleware(
						transport,
						{ ...config, service: 's3' } as Record<string, string>,
						{
							getMeta: (key) => metadata.get(key),
							setMeta: (key, value) => {
								metadata.set(key, value);
							},
						},
					)
				: transport;
		const session = new RemoteSession(target, () => true);
		const root = new Root({ ...config, request: remoteMiddleware(signed, session) });
		return { fs: prefixWrapper(new MetadataRemoteFs(root, session), prefix), raw: root };
	};
	const remote = createRemote();
	const source = await diskFs(`${localRoot}/${kind}-source`);
	const destination = await diskFs(`${localRoot}/${kind}-download`);
	const mtime = 1_700_000_123_456;
	const ctime = 1_500_000_000_000;
	const inputs: Array<[string, Binary]> = [
		['笔记 #%.md', new TextEncoder().encode('OpenList file metadata\n')],
		['empty.md', new Uint8Array(0)],
		['large.bin', new Uint8Array(6 * 1024 * 1024 + 97).map((_, i) => i % 251)],
		['nested/child/文件.md', new TextEncoder().encode('Nested directory verification\n')],
	];
	const folders = ['nested/', 'nested/child/', 'empty-directory/'];
	const uploaded = new Map<string, string>();
	await remote.fs.mkdir('/');
	try {
		for (const key of folders) {
			await remote.fs.mkdir(key);
			await source.fs.mkdir(key);
		}
		await Promise.all(
			inputs.map(async ([key, value]) => {
				await writeFile(`${localRoot}/${kind}-source/${key}`, value);
				await utimes(`${localRoot}/${kind}-source/${key}`, new Date(), new Date(mtime));
				const info = await source.fs.stat(key);
				assert.ok(!info.isDir);
				attachTimes(info, { ctime, mtime });
				const uid =
					key === 'large.bin'
						? await remote.fs.writeStream(
								key,
								await source.fs.readStream(key, info),
								info,
							)
						: await remote.fs.write(key, await source.fs.read(key, info), info);
				assert.ok(uid, 'An upload must return a usable file UID');
				uploaded.set(key, uid);
			}),
		);
		// A fresh wrapper simulates another device with no upload-side metadata cache.
		const fresh = createRemote();
		const listed = await fresh.fs.list('/', () => 'advance');
		assert.deepEqual(
			listed.map(({ key }) => key).sort(),
			[...inputs.map(([key]) => key), ...folders].sort(),
		);
		const localStats = await Promise.all(
			[...inputs.map(([key]) => key), ...folders].map((key) => source.fs.stat(key)),
		);
		const records: RecordStatsMap = new Map(
			listed.map((item) => {
				const local = localStats.find(({ key }) => key === item.key);
				assert.ok(local);
				if (item.isDir) return [item.key, { isDir: true }];
				assert.ok(!local.isDir);
				return [item.key, { isDir: false, local: local.uid, remote: item.uid }];
			}),
		);
		assert.deepEqual(
			testKit.runDecider((input) => decider(input, () => {}), {
				localStats: new Map(localStats.map((item) => [item.key, item])),
				records,
				remoteStats: new Map(listed.map((item) => [item.key, item])),
			}),
			[],
			'Second sync must not delete unchanged folders or files',
		);
		// Exercise a fresh full listing rather than relying on an earlier snapshot.
		assert.deepEqual(
			(await fresh.fs.list('/', () => 'advance')).map(({ key }) => key).sort(),
			listed.map(({ key }) => key).sort(),
		);
		for (const key of folders) await destination.fs.mkdir(key);
		await Promise.all(
			inputs.map(async ([key, value]) => {
				const info = listed.find(
					(entry): entry is FileStat => entry.key === key && !entry.isDir,
				);
				assert.ok(info);
				assert.equal(info.uid, uploaded.get(key), `Stable remote identity for ${key}`);
				assert.equal(Math.floor(info.mtime / 1000), Math.floor(mtime / 1000));
				await (key === 'large.bin'
					? destination.fs.writeStream(key, await fresh.fs.readStream(key, info), info)
					: destination.fs.write(key, await fresh.fs.read(key, info), info));
				assert.deepEqual(
					new Uint8Array(await readFile(`${localRoot}/${kind}-download/${key}`)),
					value,
				);
				const local = await destination.fs.stat(key);
				assert.ok(!local.isDir);
				assert.equal(Math.floor(local.mtime / 1000), Math.floor(mtime / 1000));
				assert.equal(destination.requested.get(key)?.ctime, getTimes(info)?.ctime);
				report.push({
					backend: kind,
					bytes: value.length,
					ctimePassedToLocalWriter: destination.requested.get(key)?.ctime,
					file: key,
					originalCtimePreservedByServer: getTimes(info)?.ctime === ctime,
					remoteCtime: getTimes(info)?.ctime,
					remoteMtime: info.mtime,
					restoredMtime: local.mtime,
				});
			}),
		);
		const [key] = inputs[0];
		await fresh.fs.move(key, 'renamed.md');
		const moved = await fresh.fs.stat('renamed.md');
		assert.ok(!moved.isDir);
		assert.equal(Math.floor(moved.mtime / 1000), Math.floor(mtime / 1000));
		const updated = new TextEncoder().encode('updated');
		await fresh.fs.write(
			'renamed.md',
			updated,
			attachTimes({ ...moved }, { ctime, mtime: mtime + 10_000 }),
		);
		const updatedStat = await fresh.fs.stat('renamed.md');
		assert.ok(!updatedStat.isDir);
		assert.equal(Math.floor(updatedStat.mtime / 1000), Math.floor((mtime + 10_000) / 1000));
		assert.deepEqual(await fresh.fs.read('renamed.md', updatedStat), updated);
		assert.ok(requests.some((entry) => entry.mtime !== undefined));
	} finally {
		for (const key of [...inputs.map(([name]) => name), 'renamed.md'])
			await remote.raw.delete(prefix + key);
		for (const key of [...folders].sort((a, b) => b.length - a.length))
			await remote.raw.delete(prefix + key);
		await remote.raw.delete(prefix);
	}
}

console.log(JSON.stringify({ localTestDirectory: localRoot, results: report }, undefined, 2));
