import type { Fs } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import MetadataRemoteFs, { RemoteSession, remoteMiddleware, UploadRemoteFs } from '../src/remote';
import { getTarget } from '../src/target';
import { metadataTime } from '../src/times';
import { createRemote, decide, object, xml } from './s3-harness';
import createVault from './vault';

const standardMtime = Date.parse('2026-10-04T11:00:00.080Z');
const metadataMtime = 1_700_000_123_456;
const ctime = 1_500_000_000_000;
const { bytes, request } = testKit;

test.each([
	{ expected: metadataMtime, unit: 'seconds', value: '1700000123.456' },
	{ expected: metadataMtime, unit: 'milliseconds', value: '1700000123456' },
	{ expected: 1001, unit: 'seconds', value: '1.001' },
	{ expected: -123, unit: 'seconds', value: '-0.1239' },
	{ expected: 0, unit: 'seconds', value: '0' },
	{ expected: 0, unit: 'milliseconds', value: '0' },
	{ expected: metadataMtime, unit: 'seconds', value: '2023-11-14T22:15:23.456Z' },
	{ expected: metadataMtime, unit: 'milliseconds', value: '2023-11-15T06:15:23.456+08:00' },
	{ expected: undefined, unit: 'seconds', value: undefined },
	{ expected: undefined, unit: 'milliseconds', value: '' },
	{ expected: undefined, unit: 'seconds', value: 'Infinity' },
	{ expected: undefined, unit: 'milliseconds', value: '9000000000000000' },
	{ expected: undefined, unit: 'seconds', value: 'invalid' },
	{ expected: undefined, unit: 'milliseconds', value: '2023-11-14T22:15:23.456' },
	{ expected: undefined, unit: 'milliseconds', value: '2023-02-30T22:15:23.456Z' },
] as const)(
	'metadata time parses explicit units and zoned ISO timestamps ($value, $unit)',
	({ value, unit, expected }) => {
		expect(metadataTime(value, unit)).toBe(expected);
	},
);

test.each([
	{ expected: standardMtime, prefer: false, streamed: false, value: '1700000123.456' },
	{ expected: metadataMtime, prefer: true, streamed: false, value: '1700000123.456' },
	{ expected: metadataMtime, prefer: true, streamed: true, value: '1700000123.456' },
	{ expected: metadataMtime, prefer: true, streamed: false, value: '2023-11-14T22:15:23.456Z' },
	{ expected: standardMtime, prefer: true, streamed: false, value: undefined },
	{ expected: standardMtime, prefer: true, streamed: true, value: 'invalid' },
])(
	'S3 download restores time without changing discovery ($value, prefer: $prefer, streamed: $streamed)',
	async ({ value, prefer, streamed, expected }) => {
		const body = bytes('body');
		const http = request((url) =>
			new URL(url).searchParams.has('list-type')
				? { text: () => xml(object('a.md', { size: body.length })) }
				: {
						bytes: () => body,
						headers: {
							'x-amz-meta-ctime': String(ctime),
							'x-amz-meta-custom': 'retained',
							...(value === undefined ? {} : { 'x-amz-meta-mtime': value }),
						},
					},
		);
		const remote = await createRemote(http.request, '', false, prefer);
		const [stat] = await remote.fs.list('/', () => 'advance');
		if (stat.isDir) throw new Error('Expected file');
		const originalUid = stat.uid;
		const vault = await createVault();
		const uid = await (streamed
			? vault.fs.writeStream('a.md', await remote.fs.readStream('a.md', stat), stat)
			: vault.fs.write('a.md', await remote.fs.read('a.md', stat), stat));
		expect(vault.files.get('a.md')).toEqual({ ctime, mtime: expected, value: body });
		expect(await stat.meta()).toEqual({
			ctime: String(ctime),
			custom: 'retained',
			mtime: String(expected),
		});
		expect(stat).toMatchObject({ mtime: standardMtime, uid: originalUid });
		const local = await vault.fs.stat('a.md');
		expect(
			await decide(
				[local],
				[stat],
				new Map([['a.md', { isDir: false, local: uid, remote: originalUid }]]),
			),
		).toEqual([]);
		expect(http.calls.map(({ method }) => method)).toEqual(['GET', 'GET']);
	},
);

test('S3 HEAD retains metadata mtime and caches the optional lookup', async () => {
	const http = request((_url, params) =>
		params.method === 'HEAD'
			? { headers: { 'x-amz-meta-mtime': String(metadataMtime / 1000) } }
			: { text: () => xml(object('a.md')) },
	);
	const remote = await createRemote(http.request, '', true, true);
	const stat = await remote.fs.stat('a.md');
	expect((await stat.meta()).mtime).toBe(String(metadataMtime));
	expect((await stat.meta()).mtime).toBe(String(metadataMtime));
	expect(stat).toMatchObject({ mtime: standardMtime });
	expect(http.calls.map(({ method }) => method)).toEqual(['GET', 'HEAD']);
});

test.each([
	{ expected: Date.parse('2026-10-04T11:00:00Z'), prefer: false, value: String(metadataMtime) },
	{ expected: metadataMtime, prefer: true, value: String(metadataMtime) },
	{ expected: Date.parse('2026-10-04T11:00:00Z'), prefer: true, value: 'invalid' },
])(
	'WebDAV consumes metadata milliseconds and retains ctime ($value, prefer: $prefer)',
	async ({ value, prefer, expected }) => {
		const endpoint = 'https://dav.example/dav';
		const target = getTarget({ modules: { webdav: { endpoint } }, remoteFs: 'webdav' });
		if (!target) throw new Error('Missing target');
		const session = new RemoteSession(
			target,
			() => true,
			() => prefer,
		);
		const meta = JSON.stringify({ ctime: String(ctime), custom: 'retained', mtime: value });
		const body = `<multistatus xmlns="DAV:"><response><href>/dav/a.md</href><propstat><prop>
<resourcetype/><getcontentlength>4</getcontentlength><getetag>backend-uid</getetag>
<getlastmodified>Sun, 04 Oct 2026 11:00:00 GMT</getlastmodified>
<creationdate>2026-10-04T11:00:00Z</creationdate><meta xmlns="https://sync.consensia.cc/deep-dive/modules/webdav">${meta}</meta>
</prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`;
		const http = request((_url, params) =>
			params.method === 'PROPFIND'
				? { status: 207, text: () => body }
				: { bytes: () => bytes('body') },
		);
		const source = new URL('../../webdav/src/webdav/fs.ts', import.meta.url).href;
		const { default: WebdavFs } = (await import(source)) as {
			default: new (options: Record<string, unknown>) => Fs;
		};
		const raw = new WebdavFs({
			endpoint,
			fileMetadata: true,
			request: remoteMiddleware(http.request, session),
		});
		const remote = new MetadataRemoteFs(new UploadRemoteFs(raw, session), session);
		const stat = await remote.stat('a.md');
		if (stat.isDir) throw new Error('Expected file');
		const vault = await createVault();
		await vault.fs.write('a.md', await remote.read('a.md', stat), stat);
		expect(vault.files.get('a.md')).toEqual({ ctime, mtime: expected, value: bytes('body') });
		expect(await stat.meta()).toEqual({
			ctime: String(ctime),
			custom: 'retained',
			mtime: String(expected),
		});
		expect(stat).toMatchObject({
			mtime: Date.parse('2026-10-04T11:00:00Z'),
			uid: 'backend-uid',
		});
		expect(http.calls.map(({ method }) => method ?? 'GET')).toEqual(['PROPFIND', 'GET']);
	},
);
