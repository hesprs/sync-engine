import type {
	Fs,
	FsWrapperEntry,
	RemoteRequestMiddlewareEntry,
	Request,
	SettingEntry,
	Translate,
} from '@hesprs/sync-engine-sdk';
import { prefixWrapper } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import type { MetadataTranslations } from '../src/setting';
import OpenListFileMetadata from '../src';
import { en } from '../src/i18n';

const { bytes, file, fs, request } = testKit;

function harness() {
	const cached = new Set(['old-metadata']);
	const remoteRequests = new Set<RemoteRequestMiddlewareEntry>();
	const remoteWrappers = new Set<FsWrapperEntry>();
	const settingEntries = new Set<SettingEntry>();
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
		registerI18n: () => {},
		registerRemoteFsWrapper: register(remoteWrappers),
		registerRemoteRequestMiddleware: register(remoteRequests),
		registerSetting: register(settingEntries),
		saveSettings: async () => {},
		settings,
		translate: ((key: keyof MetadataTranslations) =>
			en[key]) as Translate<MetadataTranslations>,
	});
	module.start();
	const wrapRequest = (original: Request) => {
		let result = original;
		for (const entry of remoteRequests) result = entry.apply(result) ?? result;
		return result;
	};
	const wrapFs = (original: Fs) => {
		let result = original;
		for (const entry of [...remoteWrappers].sort((a, b) => a.priority - b.priority))
			result = entry.apply(result) ?? result;
		return result;
	};
	return {
		cached,
		events,
		module,
		registrations: [remoteRequests, remoteWrappers, settingEntries],
		settingEntries,
		settings,
		wrapFs,
		wrapRequest,
	};
}

test('module uses transformed keys, preserves backend results, and unloads registrations', async () => {
	const setup = harness();
	expect(setup.module.moduleSettings.preferMetadataMtime).toBe(false);
	expect(setup.settingEntries.size).toBe(1);
	expect(setup.cached.size).toBe(0);
	const http = request(() => ({ headers: { etag: 'backend-uid' } }));
	const send = setup.wrapRequest(http.request);
	const root = fs({
		control: {
			stat: (key) => file(key, { uid: 'backend-uid' }),
			write: async (key, body) =>
				(await send(`https://s3.example/vault/${key}`, { body, method: 'PUT' })).headers
					.etag,
		},
		uid: 'backend',
	});
	const originalStat = root.fs.stat;
	const wrapped = prefixWrapper(setup.wrapFs(root.fs), 'physical/prefix');
	const source = file('logical.md', { meta: () => ({ ctime: '1000', mtime: '123456' }) });
	expect(await wrapped.write('opaque.md', bytes('body'), source)).toBe('backend-uid');
	expect(wrapped.getUid()).toBe('backend~physical/prefix/');
	expect(http.calls[0]).toMatchObject({
		headers: { 'X-Amz-Meta-Mtime': '123.456' },
		url: 'https://s3.example/vault/physical/prefix/opaque.md',
	});
	expect(http.calls).toHaveLength(1);
	expect(root.fs.stat).toBe(originalStat);
	setup.events.forEach((listener) => listener());
	setup.module.dispose();
	await wrapped.write('opaque.md', bytes('body'), source);
	expect(await wrapped.stat('opaque.md')).toMatchObject({ uid: 'backend-uid' });
	expect(http.calls.at(-1)?.headers).not.toHaveProperty('X-Amz-Meta-Mtime');
	expect(setup.registrations.every((entries) => entries.size === 0)).toBe(true);
	expect(setup.events.size).toBe(0);
});

test('metadata preference applies to existing stats without changing discovery identity', async () => {
	const setup = harness();
	setup.wrapRequest(request(() => ({})).request);
	const original = file('a', {
		meta: () => ({ ctime: '1500000000000', mtime: '1700000123.456' }),
		mtime: 123_456,
		uid: 'backend-uid',
	});
	const wrapped = setup.wrapFs(fs({ control: { stat: () => original } }).fs);
	const stat = await wrapped.stat('a');
	expect((await stat.meta()).mtime).toBe('123456');
	setup.module.moduleSettings.preferMetadataMtime = true;
	expect(await stat.meta()).toEqual({ ctime: '1500000000000', mtime: '1700000123456' });
	expect(stat).toMatchObject({ mtime: 123_456, uid: 'backend-uid' });
	setup.module.moduleSettings.preferMetadataMtime = false;
	expect((await stat.meta()).mtime).toBe('123456');
	setup.module.dispose();
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
	await a.write('a', bytes('a'), file('a', { meta: () => ({ mtime: '123456' }) }));
	await sendSecond('https://s3.example/vault/a', { method: 'PUT' });
	expect(first.calls[0].headers?.['X-Amz-Meta-Mtime']).toBe('123.456');
	expect(second.calls[0].headers).not.toHaveProperty('X-Amz-Meta-Mtime');
	setup.settings.remoteFs = 'webdav';
	await a.write('a', bytes('a'), file('a', { meta: () => ({ mtime: '123456' }) }));
	expect(first.calls.at(-1)?.headers).not.toHaveProperty('X-Amz-Meta-Mtime');
	setup.settings.remoteFs = 'gdrive';
	expect(setup.wrapRequest(first.request)).toBe(first.request);
	setup.module.dispose();
});

test('disabling also bypasses metadata from previously discovered stats', async () => {
	const setup = harness();
	setup.wrapRequest(request(() => ({})).request);
	const original = file('a', { meta: () => ({ mtime: 'original' }), mtime: 123_456 });
	const wrapped = setup.wrapFs(fs({ control: { stat: () => original } }).fs);
	const stat = await wrapped.stat('a');
	expect(await stat.meta()).toEqual({ mtime: '123456' });
	setup.module.dispose();
	expect(await stat.meta()).toEqual({ mtime: 'original' });
});
