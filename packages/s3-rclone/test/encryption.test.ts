import type {
	Binary,
	FileStat,
	Fs,
	FsWrapperEntry,
	RemoteRequestMiddlewareEntry,
	Translate,
} from '@hesprs/sync-engine-sdk';
import { prefixWrapper } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import type { MetadataTranslations } from '../src/setting';
import S3Rclone from '../src';
import MetadataRemoteFs, { RemoteSession, remoteMiddleware, UploadRemoteFs } from '../src/remote';
import { getTarget } from '../src/target';
import { escape, object, xml } from './s3-harness';
import createVault from './vault';

const source = new URL('../../encryption/src/wrapper/index.ts', import.meta.url).href;
const { default: encryptionWrapper } = (await import(source)) as {
	default: (original: Fs, options: Record<string, unknown>) => Fs;
};
const { bytes, file, fs, request, stream } = testKit;
const mtime = 1_700_000_123_456;
const ctime = 1_500_000_000_000;
const remoteMtime = 1_700_000_120_000;

function memoryDB() {
	const meta = new Map<string, unknown>();
	const stores = new Map<string, Map<string, string>>();
	return {
		getMeta: (key: string) => meta.get(key),
		getStore: (name: string) => {
			const values = stores.get(name) ?? new Map<string, string>();
			stores.set(name, values);
			return {
				clear: () => {
					values.clear();
				},
				delete: (key: string) => values.delete(key),
				get: (key: string) => values.get(key),
				keys: () => [...values.keys()],
				set: (key: string, value: string) => {
					values.set(key, value);
				},
			};
		},
		setMeta: (key: string, value: unknown) => {
			meta.set(key, value);
		},
	};
}

test.each([
	{ kind: 's3', streamed: false },
	{ kind: 's3', streamed: true },
])(
	'$kind encrypted uploads preserve source times and encrypt other metadata (streamed: $streamed)',
	async ({ kind, streamed }) => {
		const endpoint = 'https://remote.example';
		const settings = {
			modules: {
				[kind]: { bucket: 'vault', endpoint, urlStyle: 'path' },
				encryption: { enabled: true },
			},
			remoteFs: kind,
		};
		const target = getTarget(settings);
		if (!target) throw new Error('Missing target');
		const wrappers: Array<FsWrapperEntry> = [];
		const requests: Array<RemoteRequestMiddlewareEntry> = [];
		const module = new S3Rclone({
			on: () => () => {},
			registerI18n: () => {},
			registerRemoteFsWrapper: (entry) => {
				wrappers.push(entry);
				return () => {
					wrappers.splice(wrappers.indexOf(entry), 1);
				};
			},
			registerRemoteRequestMiddleware: (entry) => {
				requests.push(entry);
				return () => {
					requests.splice(requests.indexOf(entry), 1);
				};
			},
			registerSetting: () => () => {},
			saveSettings: async () => {},
			settings,
			translate: (() => '') as Translate<MetadataTranslations>,
		});
		module.start();
		const http = request(() => ({ headers: { ETag: 'backend-uid' } }));
		let send = http.request;
		for (const { apply } of requests.sort((a, b) => a.priority - b.priority))
			send = apply(send) ?? send;
		type Stored = { value: Binary; meta: Awaited<ReturnType<FileStat['meta']>> };
		const stored = new Map<string, Stored>();
		const get = (key: string) => {
			const entry = stored.get(key);
			if (!entry) throw new Error(`Missing file: ${key}`);
			return entry;
		};
		const stat = (key: string) =>
			file(key, {
				meta: () => get(key).meta,
				mtime: remoteMtime,
				size: get(key).value.byteLength,
				uid: 'backend-uid',
			});
		const root = fs({
			control: {
				stat,
				write: async (key, value, sourceStat) => {
					stored.set(key, { meta: await sourceStat.meta(), value });
					await send(target.url(key), { body: value, method: 'PUT' });
					return 'backend-uid';
				},
				writeStream: async (key, value, sourceStat) => {
					stored.set(key, {
						meta: await sourceStat.meta(),
						value: new Uint8Array(await new Response(value).arrayBuffer()),
					});
					await send(`${target.url(key)}?uploads=`, { method: 'POST' });
					return 'backend-uid';
				},
			},
		});
		let encrypted: Fs | undefined;
		wrappers.push(
			{ apply: (original) => prefixWrapper(original, 'physical'), priority: 6298 },
			{
				apply: (original) => {
					encrypted = encryptionWrapper(original, {
						memoryDB: memoryDB(),
						password: 'test-password',
					});
					return encrypted;
				},
				priority: 7919,
			},
		);
		let remote: Fs = root.fs;
		for (const { apply } of wrappers.sort((a, b) => a.priority - b.priority))
			remote = apply(remote) ?? remote;
		const body = bytes('encrypted file contents');
		const originalMeta = { ctime: String(ctime), custom: 'retained', mtime: String(mtime) };
		const sourceStat = file('note.md', { meta: () => originalMeta, size: body.byteLength });
		expect(
			await (streamed
				? remote.writeStream('note.md', stream([body]), sourceStat)
				: remote.write('note.md', body, sourceStat)),
		).toBe('backend-uid');
		const sent = http.calls[0];
		expect(sent.headers?.['X-Amz-Meta-Mtime']).toBe(String(mtime / 1000));
		const [key, entry] = [...stored.entries()][0];
		expect(key).toStartWith('physical/');
		expect(key).not.toBe('physical/note.md');
		expect(entry.value).not.toEqual(body);
		expect(Object.keys(entry.meta)).toEqual(['ctime', 'custom']);
		expect(entry.meta.custom).not.toBe('retained');
		expect(await sourceStat.meta()).toEqual(originalMeta);
		if (!encrypted) throw new Error('Missing encryption wrapper');
		// Files uploaded without the time wrapper can still contain encrypted times.
		await encrypted.write(
			'legacy.md',
			body,
			file('legacy.md', { meta: () => originalMeta, size: body.byteLength }),
		);
		const legacy = await remote.stat('legacy.md');
		expect(await legacy.meta()).toEqual({
			ctime: String(ctime),
			custom: 'retained',
			mtime: String(remoteMtime),
		});
		module.moduleSettings.preferMetadataMtime = true;
		expect((await legacy.meta()).mtime).toBe(String(mtime));
		expect(legacy).toMatchObject({ mtime: remoteMtime, uid: 'backend-uid' });
		await encrypted.write(
			'invalid-time.md',
			body,
			file('invalid-time.md', {
				meta: () => ({ ...originalMeta, mtime: 'invalid' }),
				size: body.length,
			}),
		);
		const invalidTime = await remote.stat('invalid-time.md');
		expect((await invalidTime.meta()).mtime).toBe(String(remoteMtime));
		module.dispose();
		expect(await legacy.meta()).toEqual(originalMeta);
	},
);

test.each([
	{ preferMetadataMtime: false, streamed: false },
	{ preferMetadataMtime: false, streamed: true },
	{ preferMetadataMtime: true, streamed: false },
	{ preferMetadataMtime: true, streamed: true },
])(
	'encrypted S3 downloads handle the time header (streamed: $streamed, prefer metadata: $preferMetadataMtime)',
	async ({ streamed, preferMetadataMtime }) => {
		const endpoint = 'https://s3.example';
		const target = getTarget({
			modules: { s3: { bucket: 'vault', endpoint, urlStyle: 'path' } },
			remoteFs: 's3',
		});
		if (!target) throw new Error('Missing target');
		type Stored = { value: Binary; headers: Record<string, string> };
		const stored = new Map<string, Stored>();
		const http = request((url, params) => {
			const parsed = new URL(url);
			const key = decodeURIComponent(parsed.pathname.slice('/vault/'.length));
			if (params.method === 'PUT') {
				if (!(params.body instanceof Uint8Array)) throw new Error('Expected binary upload');
				stored.set(key, { headers: params.headers ?? {}, value: params.body });
				return { headers: { ETag: 'transient' } };
			}
			if (parsed.searchParams.has('list-type')) {
				const prefix = parsed.searchParams.get('prefix') ?? '';
				return {
					text: () =>
						xml(
							[...stored]
								.filter(([name]) => name.startsWith(prefix))
								.map(([name, entry]) =>
									object(name, {
										mtime: new Date(remoteMtime).toISOString(),
										size: entry.value.length,
									}),
								)
								.join(''),
						),
				};
			}
			const entry = stored.get(key);
			if (!entry) throw new Error(`Missing object: ${escape(key)}`);
			return { bytes: () => entry.value, headers: entry.headers };
		});
		const s3Source = new URL('../../s3/src/s3/fs.ts', import.meta.url).href;
		const { default: S3Fs } = (await import(s3Source)) as {
			default: new (options: Record<string, unknown>) => Fs;
		};
		const session = new RemoteSession(
			target,
			() => true,
			() => preferMetadataMtime,
			{ encryptedMetadata: () => true },
		);
		const raw = new S3Fs({
			accessKeyId: 'key',
			bucket: 'vault',
			endpoint,
			fetchObjectMeta: false,
			region: 'us-east-1',
			request: remoteMiddleware(http.request, session),
			urlStyle: 'path',
		});
		const remote = new MetadataRemoteFs(
			encryptionWrapper(prefixWrapper(new UploadRemoteFs(raw, session), 'physical'), {
				memoryDB: memoryDB(),
				password: 'test-password',
			}),
			session,
		);
		const body = bytes('encrypted file contents');
		await remote.write(
			'note.md',
			body,
			file('note.md', {
				meta: () => ({ ctime: String(ctime), custom: 'retained', mtime: String(mtime) }),
				size: body.length,
			}),
		);
		const entry = [...stored.values()][0];
		expect(entry.headers['X-Amz-Meta-Mtime']).toBe(String(mtime / 1000));
		expect(entry.headers['x-amz-meta-ctime']).not.toBe(String(ctime));
		const [stat] = await remote.list('/', () => 'advance');
		if (stat.isDir) throw new Error('Expected file');
		expect(await stat.meta()).toEqual({ mtime: String(remoteMtime) });
		const vault = await createVault();
		await (streamed
			? vault.fs.writeStream('note.md', await remote.readStream('note.md', stat), stat)
			: vault.fs.write('note.md', await remote.read('note.md', stat), stat));
		const expectedMtime = preferMetadataMtime ? mtime : remoteMtime;
		expect(vault.files.get('note.md')).toEqual({ ctime, mtime: expectedMtime, value: body });
		expect(await stat.meta()).toEqual({
			ctime: String(ctime),
			custom: 'retained',
			mtime: String(expectedMtime),
		});
		expect(stat).toMatchObject({ mtime: remoteMtime });
		expect(http.calls.some(({ method }) => method === 'HEAD')).toBe(false);
	},
);

test('encrypted metadata authentication failures propagate without decrypting plaintext mtime', async () => {
	const target = getTarget({
		modules: { s3: { bucket: 'vault', endpoint: 'https://s3.example', urlStyle: 'path' } },
		remoteFs: 's3',
	});
	if (!target) throw new Error('Missing target');
	const session = new RemoteSession(
		target,
		() => true,
		() => true,
		{ encryptedMetadata: () => true },
	);
	const original = fs({
		control: {
			stat: (key) =>
				file(key, {
					meta: () => ({
						ctime: btoa('corrupted metadata authentication tag'),
						mtime: String(mtime / 1000),
					}),
					mtime: remoteMtime,
				}),
		},
	});
	const remote = new MetadataRemoteFs(
		encryptionWrapper(new UploadRemoteFs(original.fs, session), {
			memoryDB: memoryDB(),
			password: 'test-password',
		}),
		session,
	);
	const stat = await remote.stat('a.md');
	const result = await Promise.resolve(stat.meta()).catch((error: unknown) => error);
	expect(result).toBeInstanceOf(Error);
	expect(result).toMatchObject({
		message: 'Decryption error: incorrect encryption password or the data is corrupted',
	});
});
