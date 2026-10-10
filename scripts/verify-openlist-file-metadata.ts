// oxlint-disable import/no-nodejs-modules no-console
// Run with the module's test preload. Credentials are read only from environment.
import assert from 'node:assert/strict';
import {
	appendFile,
	mkdir,
	readFile,
	rename,
	rm,
	stat as diskStat,
	utimes,
	writeFile,
} from 'node:fs/promises';
import type {
	Binary,
	BaseTask,
	DeciderInput,
	FileStat,
	Fs,
	RecordStatsMap,
	RecordStat,
	Request,
	Stat,
	VaultRequest,
} from '../packages/plugin/dist/index.spec';
import MetadataRemoteFs, {
	RemoteSession,
	remoteMiddleware,
	UploadRemoteFs,
} from '../packages/openlist-file-metadata/src/remote';
import { getTarget, header } from '../packages/openlist-file-metadata/src/target';

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
)) as { default: new (request: VaultRequest, name: string) => Fs };
const { default: prefixWrapper } = (await import(
	new URL('../packages/plugin/src/sdk/prefix.ts', import.meta.url).href
)) as { default: (fs: Fs, prefix: string) => Fs };
const { sigv4Middleware } = (await import(
	new URL('../packages/s3/src/s3/sigv4.ts', import.meta.url).href
)) as {
	sigv4Middleware: (
		request: Request,
		config: { accessKeyId: string; region: string; secretAccessKey: string; service: string },
		db: { getMeta: (key: string) => unknown; setMeta: (key: string, value: unknown) => void },
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
			const info = await diskStat(name);
			return {
				ctime: info.birthtimeMs,
				mtime: info.mtimeMs,
				size: info.size,
				type: info.isDirectory() ? 'folder' : 'file',
			} as never;
		}
		if (params.method === 'EXISTS')
			return (await diskStat(name).then(
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
	return { fs: new VaultFs(request, root), requested };
}

for (const kind of ['s3', 'webdav'] as const) {
	const endpoint = env(kind === 's3' ? 'OPENLIST_S3_ENDPOINT' : 'OPENLIST_DAV_ENDPOINT');
	const config =
		kind === 's3'
			? {
					accessKeyId: env('OPENLIST_S3_ACCESS_KEY'),
					bucket: env('OPENLIST_S3_BUCKET'),
					endpoint,
					fetchObjectMeta: false,
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
	const requests: Array<{ method: string; mtime?: string; ctime?: string }> = [];
	const transport: Request = async (url, params = {}) => {
		requests.push({
			ctime: header(params.headers ?? {}, kind === 's3' ? 'x-amz-meta-ctime' : 'x-oc-ctime'),
			method: params.method ?? 'GET',
			mtime: header(params.headers ?? {}, kind === 's3' ? 'x-amz-meta-mtime' : 'x-oc-mtime'),
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
		let signed = transport;
		if (kind === 's3') {
			const { accessKeyId, region, secretAccessKey } = config;
			assert.ok(accessKeyId && region && secretAccessKey);
			signed = sigv4Middleware(
				transport,
				{ accessKeyId, region, secretAccessKey, service: 's3' },
				{
					getMeta: (key) => metadata.get(key),
					setMeta: (key, value) => {
						metadata.set(key, value);
					},
				},
			);
		}
		const session = new RemoteSession(target, () => true);
		const root = new Root({ ...config, request: remoteMiddleware(signed, session) });
		return {
			fs: prefixWrapper(
				new MetadataRemoteFs(new UploadRemoteFs(root, session), session),
				prefix,
			),
			raw: root,
		};
	};
	const remote = createRemote();
	const source = await diskFs(`${localRoot}/${kind}-source`);
	const destination = await diskFs(`${localRoot}/${kind}-download`);
	const mtime = 1_700_000_123_456;
	const inputs: Array<[string, Binary]> = [
		['笔记 #%.md', new TextEncoder().encode('OpenList file metadata\n')],
		['empty.md', new Uint8Array(0)],
		['large.bin', new Uint8Array(6 * 1024 * 1024 + 97).map((_, i) => i % 251)],
	];
	const folders = ['nested/', 'nested/child/', 'empty-directory/'];
	inputs.push(['nested/child/note.md', new TextEncoder().encode('Nested note\n')]);
	const uploaded = new Map<string, string>();
	await remote.fs.mkdir('/', { isDir: true, key: '/', meta: () => ({}) });
	try {
		for (const key of folders) {
			const folder: Stat = { isDir: true, key, meta: () => ({}) };
			await remote.fs.mkdir(key, folder);
			await source.fs.mkdir(key, folder);
		}
		for (const [key, value] of inputs) {
			await writeFile(`${localRoot}/${kind}-source/${key}`, value);
			await utimes(`${localRoot}/${kind}-source/${key}`, new Date(), new Date(mtime));
			const info = await source.fs.stat(key);
			assert.ok(!info.isDir);
			const uid =
				key === 'large.bin'
					? await remote.fs.writeStream(key, await source.fs.readStream(key, info), info)
					: await remote.fs.write(key, await source.fs.read(key, info), info);
			uploaded.set(key, uid);
		}
		const fresh = createRemote();
		const listed = await fresh.fs.list('/', () => 'advance');
		assert.deepEqual(
			listed.map(({ key }) => key).sort(),
			[...inputs.map(([key]) => key), ...folders].sort(),
		);
		const localStats = new Map<string, Stat>();
		for (const [key] of inputs) localStats.set(key, await source.fs.stat(key));
		for (const key of folders) localStats.set(key, { isDir: true, key, meta: () => ({}) });
		const records: RecordStatsMap = new Map<string, RecordStat>(
			listed.map((stat) => {
				const local = localStats.get(stat.key);
				assert.ok(local);
				if (stat.isDir) return [stat.key, { isDir: true }];
				assert.ok(!local.isDir);
				assert.equal(uploaded.get(stat.key), stat.uid);
				return [stat.key, { isDir: false, local: local.uid, remote: stat.uid }];
			}),
		);
		assert.deepEqual(
			testKit.runDecider((input) => decider(input, () => {}), {
				localStats,
				records,
				remoteStats: new Map(listed.map((stat) => [stat.key, stat])),
			}),
			[],
			'Second sync must not download unchanged files or delete directories',
		);
		for (const key of folders)
			await destination.fs.mkdir(key, { isDir: true, key, meta: () => ({}) });
		for (const [key, value] of inputs) {
			const info = listed.find(
				(entry): entry is FileStat => entry.key === key && !entry.isDir,
			);
			assert.ok(info);
			const meta = await info.meta();
			assert.equal(meta.mtime, String(info.mtime));
			await (key === 'large.bin'
				? destination.fs.writeStream(key, await fresh.fs.readStream(key, info), info)
				: destination.fs.write(key, await fresh.fs.read(key, info), info));
			assert.deepEqual(
				new Uint8Array(await readFile(`${localRoot}/${kind}-download/${key}`)),
				value,
			);
			const local = await destination.fs.stat(key);
			assert.ok(!local.isDir);
			assert.equal(local.mtime, info.mtime);
			const downloadedMeta = await info.meta();
			assert.equal(
				destination.requested.get(key)?.ctime,
				downloadedMeta.ctime === undefined ? undefined : Number(downloadedMeta.ctime),
			);
			report.push({
				backend: kind,
				bytes: value.length,
				ctimePassedToWriter: destination.requested.get(key)?.ctime,
				file: key,
				listedUid: info.uid,
				remoteMtime: info.mtime,
				restoredMtime: local.mtime,
				uploadedUid: uploaded.get(key),
			});
		}
		assert.ok(
			requests.some(
				(entry) =>
					entry.mtime === String(kind === 's3' ? mtime / 1000 : Math.floor(mtime / 1000)),
			),
		);
		if (kind === 's3') assert.ok(requests.some((entry) => entry.ctime !== undefined));
	} finally {
		for (const [key] of inputs) await remote.raw.delete(prefix + key);
		for (const key of [...folders].reverse()) await remote.raw.delete(prefix + key);
		await remote.raw.delete(prefix);
	}
}

console.log(JSON.stringify({ localTestDirectory: localRoot, results: report }, undefined, 2));
