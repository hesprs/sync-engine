import { decodePack, encodePack, packFileName, readIndexOnly, textBytes } from '@/pack';
import { expect, test } from 'bun:test';
import type { IndexEntry } from '@/types';

function entry(overrides: Partial<IndexEntry> = {}): IndexEntry {
	return {
		at: 1000,
		blobs: [],
		chunks: [],
		deviceId: 'device-a',
		flags: 0,
		key: 'note.md',
		keyHash: 'kh',
		lamport: 1,
		parents: [],
		...overrides,
	};
}

const baseHeader = {
	baseLamport: 1,
	createdAt: 1000,
	deviceId: 'device-a',
	ns: 'ns',
	peakLamport: 3,
	seq: 7,
};

test('encodePack/decodePack round-trips entries and inflated payload', async () => {
	const payload = textBytes('# header\nbody text');
	const encoded = await encodePack(
		baseHeader,
		[entry(), entry({ key: 'b.md', lamport: 3 })],
		payload,
	);
	const decoded = await decodePack(encoded.bytes);
	expect(decoded.entries).toHaveLength(2);
	expect(decoded.header.hash).toBe(encoded.header.hash);
	expect(new TextDecoder().decode(decoded.payload)).toBe('# header\nbody text');
	expect(decoded.header.codec).toBe('deflate');
});

test('the hash is self-certifying: readIndexOnly recomputes the same value', async () => {
	const encoded = await encodePack(baseHeader, [entry()], textBytes('data'));
	const parsed = await readIndexOnly(encoded.bytes);
	expect(parsed.header.hash).toBe(encoded.header.hash);
	expect(parsed.entries[0].key).toBe('note.md');
});

test('entries are sorted by (lamport, deviceId, keyHash)', async () => {
	const encoded = await encodePack(
		baseHeader,
		[
			entry({ deviceId: 'z', keyHash: 'a', lamport: 5 }),
			entry({ deviceId: 'a', keyHash: 'z', lamport: 1 }),
			entry({ deviceId: 'a', keyHash: 'a', lamport: 1 }),
		],
		textBytes('x'),
	);
	expect(encoded.entries.map((e) => `${e.lamport}:${e.deviceId}:${e.keyHash}`)).toStrictEqual([
		'1:a:a',
		'1:a:z',
		'5:z:a',
	]);
});

test('a corrupt magic is rejected', async () => {
	const encoded = await encodePack(baseHeader, [entry()], textBytes('x'));
	const corrupted = Uint8Array.from(encoded.bytes);
	corrupted[0] = 0;
	let message = '';
	try {
		await decodePack(corrupted);
	} catch (error) {
		message = (error as Error).message;
	}
	expect(message).toBe('Invalid pack magic');
});

test('an empty payload uses the raw codec', async () => {
	const encoded = await encodePack(baseHeader, [entry()], new Uint8Array(0));
	expect(encoded.header.codec).toBe('raw');
	const decoded = await decodePack(encoded.bytes);
	expect(decoded.payload.byteLength).toBe(0);
});

test('packFileName embeds seq and hash', () => {
	expect(packFileName('d', 18, 'ab12')).toBe('p-00000018-ab12.pack');
});
