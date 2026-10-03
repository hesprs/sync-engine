import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import { attachTimes, getTimes } from '../src/times';
import createVault from './vault';

const { bytes, file, stream } = testKit;
const mtime = 1_700_000_123_456;
const ctime = 1_500_000_000_000;

test('local discovery retains creation time without changing identity', async () => {
	const vault = await createVault();
	vault.files.set('a.md', { ctime, mtime, value: bytes('hello') });
	const [stat] = await vault.fs.list('/', () => 'advance');
	expect(stat).toMatchObject({ key: 'a.md', mtime, uid: `${mtime}~5` });
	if (stat.isDir) throw new Error('Expected file');
	expect(getTimes(stat)).toEqual({ ctime, mtime });
});

test('buffered downloads return the restored UID and bypass stale vault cache', async () => {
	const vault = await createVault();
	const stat = attachTimes(file('source.md'), { ctime, mtime });
	expect(await vault.fs.write('renamed.md', bytes('hello'), stat)).toBe(`${mtime}~5`);
	expect(vault.files.get('renamed.md')).toEqual({ ctime, mtime, value: bytes('hello') });
	expect(vault.calls.at(-1)?.params).toMatchObject({ cached: false, method: 'STAT' });
	expect(vault.session.writing.size).toBe(0);
});

test('streamed downloads apply times after all chunks and before temporary rename', async () => {
	const vault = await createVault();
	const stat = attachTimes(file('a', { size: 7 }), { ctime, mtime });
	const uid = await vault.fs.writeStream('a', stream(['abc', 'defg']), stat);
	expect(uid).toBe(`${mtime}~7`);
	expect(vault.files.get('a')).toEqual({ ctime, mtime, value: bytes('abcdefg') });
	expect([...vault.files.keys()]).toEqual(['a']);
	const moveIndex = vault.calls.findIndex(({ params }) => params?.method === 'MOVE');
	expect(vault.calls[moveIndex - 1].params).toMatchObject({
		ctime,
		method: 'APPEND',
		mtime,
		value: bytes(''),
	});
});

test('empty streamed files are created and failures remove temporary files and pending metadata', async () => {
	const vault = await createVault();
	expect(
		await vault.fs.writeStream(
			'empty',
			stream(),
			attachTimes(file('empty', { size: 0 }), { ctime, mtime }),
		),
	).toBe(`${mtime}~0`);
	expect(vault.files.get('empty')?.value).toHaveLength(0);
	vault.fail();
	expect(
		await vault.fs
			.writeStream('failed', stream(['body']), attachTimes(file('failed'), { mtime }))
			.catch((error: unknown) => error),
	).toMatchObject({ message: 'append failed' });
	expect([...vault.files.keys()]).toEqual(['empty']);
	expect(vault.session.writing.size).toBe(0);
});

test('missing creation time does not overwrite existing ctime and generated content is not dated to epoch', async () => {
	const vault = await createVault();
	vault.files.set('old', { ctime, mtime: 123, value: bytes('old') });
	await vault.fs.write('old', bytes('new'), attachTimes(file('old'), { mtime }));
	expect(vault.files.get('old')).toMatchObject({ ctime, mtime });
	await vault.fs.write('merged', bytes('merge'), file('merged', { mtime: 0 }));
	expect(vault.files.get('merged')?.mtime).toBeGreaterThan(mtime);
});

test('concurrent downloads restore their own times and disabling bypasses old metadata', async () => {
	let enabled = true;
	const vault = await createVault(() => enabled);
	await Promise.all(
		[1, 2, 3].map((index) =>
			vault.fs.writeStream(
				String(index),
				stream([String(index)]),
				attachTimes(file(String(index)), { ctime: ctime + index, mtime: mtime + index }),
			),
		),
	);
	expect([1, 2, 3].map((index) => vault.files.get(String(index))?.mtime)).toEqual([
		mtime + 1,
		mtime + 2,
		mtime + 3,
	]);
	enabled = false;
	await vault.fs.write('disabled', bytes('a'), attachTimes(file('disabled'), { ctime, mtime }));
	expect(vault.files.get('disabled')?.mtime).toBeGreaterThan(mtime);
});
