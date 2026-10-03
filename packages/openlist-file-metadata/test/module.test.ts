import type {
	Fs,
	FsWrapperEntry,
	LocalRequestMiddlewareEntry,
	RemoteRequestMiddlewareEntry,
	Request,
} from '@hesprs/sync-engine-sdk';
import { prefixWrapper } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import OpenListFileMetadata from '../src';
import { attachTimes } from '../src/times';

const { bytes, file, fs, request } = testKit;

function harness() {
	const cached = new Set(['incomplete-file-only-list']);
	const localRequests = new Set<LocalRequestMiddlewareEntry>();
	const remoteRequests = new Set<RemoteRequestMiddlewareEntry>();
	const localWrappers = new Set<FsWrapperEntry>();
	const remoteWrappers = new Set<FsWrapperEntry>();
	const events = new Set<() => void>();
	const register =
		<T>(entries: Set<T>) =>
		(entry: T) => {
			entries.add(entry);
			return () => {
				entries.delete(entry);
			};
		};
	const settings = {
		modules: { s3: { bucket: 'vault', endpoint: 'https://s3.example', urlStyle: 'path' } },
		remoteFs: 's3',
	};
	const module = new OpenListFileMetadata({
		memoryDB: {
			getStore: () => ({
				clear: () => {
					cached.clear();
				},
			}),
		},
		on: (_key, listener) => register(events)(() => listener({ result: 'completed' } as never)),
		registerLocalFsWrapper: register(localWrappers),
		registerLocalRequestMiddleware: register(localRequests),
		registerRemoteFsWrapper: register(remoteWrappers),
		registerRemoteRequestMiddleware: register(remoteRequests),
		settings,
	});
	module.start();
	const wrapRequest = (original: Request) => {
		let result = original;
		for (const entry of remoteRequests) result = entry.apply(result) ?? result;
		return result;
	};
	const wrapFs = (original: Fs) => {
		let result = original;
		for (const entry of remoteWrappers) result = entry.apply(result) ?? result;
		return result;
	};
	return {
		cached,
		events,
		module,
		registrations: [localRequests, remoteRequests, localWrappers, remoteWrappers],
		settings,
		wrapFs,
		wrapRequest,
	};
}

test('module uses transformed keys, preserves backend UID, and unloads all registrations', async () => {
	const setup = harness();
	expect(setup.cached.size).toBe(0);
	const http = request(() => ({ headers: { etag: 'transient' } }));
	const send = setup.wrapRequest(http.request);
	const root = fs({
		control: {
			stat: (key) => file(key, { uid: 'durable' }),
			write: async (key, body) =>
				(await send(`https://s3.example/vault/${key}`, { body, method: 'PUT' })).headers
					.etag,
		},
		uid: 'backend',
	});
	const wrapped = prefixWrapper(setup.wrapFs(root.fs), 'physical/prefix');
	const source = attachTimes(file('logical.md'), { ctime: 1000, mtime: 123_456 });
	expect(await wrapped.write('opaque.md', bytes('body'), source)).toBe('durable');
	expect(wrapped.getUid()).toBe('backend~physical/prefix/');
	expect(http.calls[0]).toMatchObject({
		headers: { 'X-Amz-Meta-Mtime': '123.456' },
		url: 'https://s3.example/vault/physical/prefix/opaque.md',
	});
	setup.events.forEach((listener) => listener());
	setup.module.dispose();
	await wrapped.write('opaque.md', bytes('body'), source);
	expect(http.calls.at(-1)?.headers).not.toHaveProperty('X-Amz-Meta-Mtime');
	expect(setup.registrations.every((entries) => entries.size === 0)).toBe(true);
	expect(setup.events.size).toBe(0);
});

test('separate request instances do not share upload state and unsupported backends are untouched', async () => {
	const setup = harness();
	const first = request(() => ({}));
	const sendFirst = setup.wrapRequest(first.request);
	const a = setup.wrapFs(
		fs({
			control: {
				write: async () => {
					await sendFirst('https://s3.example/vault/a', { method: 'PUT' });
					return 'uid';
				},
			},
		}).fs,
	);
	const second = request(() => ({}));
	const sendSecond = setup.wrapRequest(second.request);
	setup.wrapFs(fs().fs);
	await a.write('a', bytes('a'), attachTimes(file('a'), { mtime: 123_456 }));
	await sendSecond('https://s3.example/vault/a', { method: 'PUT' });
	expect(first.calls[0].headers?.['X-Amz-Meta-Mtime']).toBe('123.456');
	expect(second.calls[0].headers).not.toHaveProperty('X-Amz-Meta-Mtime');
	setup.settings.remoteFs = 'gdrive';
	expect(setup.wrapRequest(first.request)).toBe(first.request);
	setup.module.dispose();
});
