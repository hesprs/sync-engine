import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import MetadataRemoteFs, { RemoteSession } from '../src/remote';
import { target } from './s3-harness';
import createVault from './vault';

const { bytes, file, fs, stream } = testKit;
const mtime = 1_700_000_123_456;
const ctime = 1_500_000_000_000;

async function downloadStat() {
	const backend = fs({
		control: {
			stat: () =>
				file('source', {
					meta: () => ({ ctime: String(ctime), mtime: '123' }),
					mtime,
				}),
		},
	});
	const remote = new MetadataRemoteFs(backend.fs, new RemoteSession(target, () => true));
	const stat = await remote.stat('source');
	if (stat.isDir) throw new Error('Expected file');
	return stat;
}

test('local discovery already provides SDK times without a module wrapper', async () => {
	const vault = await createVault();
	vault.files.set('a.md', { ctime, mtime, value: bytes('hello') });
	const [stat] = await vault.fs.list('/', () => 'advance');
	expect(stat).toMatchObject({ key: 'a.md', mtime, uid: `${mtime}~5` });
	expect(await stat.meta()).toEqual({ ctime: String(ctime), mtime: String(mtime) });
});

test('buffered downloads pass standard mtime directly to the common writer', async () => {
	const vault = await createVault();
	const stat = await downloadStat();
	expect(await vault.fs.write('renamed.md', bytes('hello'), stat)).toBe(`${mtime}~5`);
	expect(vault.files.get('renamed.md')).toMatchObject({ ctime, mtime, value: bytes('hello') });
	expect(vault.calls[0].params).toMatchObject({ ctime, method: 'PUT', mtime });
	expect(vault.calls.map(({ params }) => params?.method)).toEqual(['PUT', 'STAT']);
	expect(vault.calls[1].params).not.toHaveProperty('cached');
});

test('streamed downloads use common APPEND metadata with no extra timestamp operation', async () => {
	const vault = await createVault();
	const stat = await downloadStat();
	expect(await vault.fs.writeStream('a', stream(['abc', 'defg']), stat)).toBe(`${mtime}~7`);
	expect(vault.files.get('a')).toMatchObject({ ctime, mtime, value: bytes('abcdefg') });
	const appends = vault.calls.filter(({ params }) => params?.method === 'APPEND');
	expect(appends.map(({ params }) => params)).toEqual([
		{ ctime, method: 'APPEND', mtime, value: bytes('abc') },
		{ ctime, method: 'APPEND', mtime, value: bytes('defg') },
	]);
	expect([...vault.files.keys()]).toEqual(['a']);
});

test('failed appends expose common writer failures without repair', async () => {
	const vault = await createVault();
	const stat = await downloadStat();
	vault.fail();
	expect(
		await Promise.resolve(vault.fs.writeStream('failed', stream(['body']), stat)).catch(
			(error: unknown) => error,
		),
	).toMatchObject({ message: 'append failed' });
	expect(vault.files.size).toBe(0);
});
