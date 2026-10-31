import RcloneFs from '@/remote';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import type { Fs, Stat } from '@hesprs/sync-engine-sdk';

const { bytes, file, fs: testFs, stream } = testKit;
const MS = 1_700_000_123_456;
const SECONDS = '1700000123.456';
const CTIME = '1600000123456';
const ENCRYPTED = 'dGVzdC1lbmNyeXB0ZWQtbXRpbWU=';

function adapter(original: Fs) {
	return new RcloneFs(original);
}

function listing(stats: Array<Stat>) {
	return testFs({ control: { list: () => stats } });
}

test.each(['write', 'writeStream'] as const)(
	'%s converts mtime milliseconds to rclone seconds',
	async (method) => {
		const meta = { ctime: CTIME, custom: 'value', mtime: String(MS) };
		const source = file('note.md', { meta: () => meta, mtime: MS });
		const backend = testFs({
			control: {
				write: async (_key, _value, stat) => {
					expect(await stat.meta()).toEqual({ ...meta, mtime: SECONDS });
					return 'written';
				},
				writeStream: async (_key, _value, stat) => {
					expect(await stat.meta()).toEqual({ ...meta, mtime: SECONDS });
					return 'written';
				},
			},
		});
		const fs = adapter(backend.fs);
		const uid =
			method === 'write'
				? await fs.write(source.key, bytes('note'), source)
				: await fs.writeStream(source.key, stream(['note']), source);
		expect(uid).toBe('written');
		expect(await source.meta()).toEqual(meta);
	},
);

test('write preserves non-numeric mtime (encrypted meta) unchanged', async () => {
	const meta = { mtime: ENCRYPTED };
	const source = file('note.md', { meta: () => meta });
	const backend = testFs({
		control: {
			write: async (_key, _value, stat) => {
				expect(await stat.meta()).toEqual({ mtime: ENCRYPTED });
				return 'written';
			},
		},
	});
	const fs = adapter(backend.fs);
	await fs.write(source.key, bytes('note'), source);
});

test('list preserves non-numeric mtime (encrypted meta) unchanged', async () => {
	const source = file('note.md', { meta: () => ({ mtime: ENCRYPTED }), mtime: MS });
	const fs = adapter(listing([source]).fs);
	const [stat] = await fs.list('/', () => 'include');
	expect(await stat.meta()).toEqual({ mtime: ENCRYPTED });
});

test('list converts rclone seconds back to milliseconds', async () => {
	// Stat.mtime differs from the converted meta, so a substitution would fail this test.
	const source = file('note.md', { meta: () => ({ mtime: SECONDS }), mtime: 1_234_567_890_123 });
	const fs = adapter(listing([source]).fs);
	const [stat] = await fs.list('/', () => 'include');
	expect(await stat.meta()).toEqual({ mtime: String(MS) });
});

test('list refills missing mtime meta from the listing time', async () => {
	// Rclone serve s3 keeps object metadata in memory only, so x-amz-meta-mtime disappears on
	// Server restarts while the listing's mtime (disk modtime) survives.
	const source = file('note.md', { mtime: MS });
	const fs = adapter(listing([source]).fs);
	const [stat] = await fs.list('/', () => 'include');
	expect(await stat.meta()).toEqual({ mtime: String(MS) });
});
