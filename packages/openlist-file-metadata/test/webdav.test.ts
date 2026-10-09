import type { Fs } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import MetadataRemoteFs, { RemoteSession, remoteMiddleware, UploadRemoteFs } from '../src/remote';
import { getTarget } from '../src/target';
import createVault from './vault';

const endpoint = 'https://dav.example/dav';
const target = getTarget({ modules: { webdav: { endpoint } }, remoteFs: 'webdav' });
if (!target) throw new Error('Missing target');
const body = `<multistatus xmlns="DAV:"><response><href>/dav/note.md</href><propstat><prop>
<creationdate>2017-07-14T02:40:00Z</creationdate><resourcetype/><getcontentlength>4</getcontentlength><getetag>backend-uid</getetag>
<getlastmodified>Sun, 04 Oct 2026 11:00:00 GMT</getlastmodified>
</prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`;

test('WebDAV standard properties flow into common local writes with creationdate in the existing PROPFIND', async () => {
	const source = new URL('../../webdav/src/webdav/fs.ts', import.meta.url).href;
	const { default: WebdavFs } = (await import(source)) as {
		default: new (options: Record<string, unknown>) => Fs;
	};
	const session = new RemoteSession(target, () => true);
	const http = testKit.request((_url, params) =>
		params.method === 'PROPFIND'
			? { status: 207, text: () => body }
			: { bytes: () => testKit.bytes('body'), headers: { 'X-OC-Mtime': '123' } },
	);
	const backend = new WebdavFs({
		endpoint,
		fileMetadata: false,
		request: remoteMiddleware(http.request, session),
	});
	const remote = new MetadataRemoteFs(new UploadRemoteFs(backend, session), session);
	const stat = await remote.stat('note.md');
	if (stat.isDir) throw new Error('Expected file');
	const mtime = Date.parse('2026-10-04T11:00:00Z');
	expect(await stat.meta()).toEqual({ ctime: '1500000000000', mtime: String(mtime) });
	expect(http.calls[0].body).toContain('creationdate');
	const vault = await createVault();
	expect(await vault.fs.write('note.md', await remote.read('note.md', stat), stat)).toBe(
		`${mtime}~4`,
	);
	expect(vault.files.get('note.md')?.ctime).toBe(1_500_000_000_000);
	expect(http.calls.map(({ method }) => method ?? 'GET')).toEqual(['PROPFIND', 'GET']);
});
