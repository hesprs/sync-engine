import { test, expect } from 'bun:test';
import { testKit } from '@/sdk/dev';
import prefixWrapper from '@/sdk/prefix';

const { bytes, file, folder, fs: testFs, stream } = testKit;

test('base-dir shim rewrites keys relative to its base', async () => {
	const remote = testFs({ uid: 'remote' });
	const shim = prefixWrapper(remote.fs, '/base');

	expect(shim.getUid()).toBe('remote~base/');

	const rootStat = await shim.stat('/');
	const stat = await shim.stat('note.md');
	const list = await shim.list('/', () => 'include');
	const readStat = file('note.md', { size: 42 });
	const writeStat = file('note.md', { size: 7 });
	await shim.readStream('note.md', readStat);
	await shim.writeStream('note.md', stream([bytes('x')]), writeStat);

	expect(remote.calls.stat).toStrictEqual(['base/', 'base/note.md']);
	expect(rootStat).toStrictEqual(folder('/'));
	expect(stat).toStrictEqual(file('note.md', { mtime: 10, uid: 'uid' }));
	expect(remote.calls.list).toStrictEqual(['base/']);
	expect(remote.calls.readStream).toStrictEqual([['base/note.md', readStat]]);
	expect(remote.calls.writeStream).toStrictEqual([['base/note.md', writeStat]]);
	expect(list).toStrictEqual([
		folder('folder/'),
		file('folder/note.md', { mtime: 12, size: 7, uid: 'note-2' }),
	]);
});
