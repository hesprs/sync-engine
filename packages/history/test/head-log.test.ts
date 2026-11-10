import { buildCommitLog, decodeHeadLog, encodeHeadLog } from '@/head-log';
import { expect, test } from 'bun:test';

async function log() {
	return buildCommitLog({
		chunkIndex: { abc: 'd:1:h' },
		deviceId: 'device-a',
		generation: 0,
		heads: ['note.md@3'],
		ns: 'ns',
		packs: [],
		peakLamport: 3,
		seq: 1,
		updatedAt: 1000,
	});
}

test('a head log round-trips and verifies its integrity hash', async () => {
	const value = await log();
	const decoded = await decodeHeadLog(encodeHeadLog(value));
	expect(decoded).toStrictEqual(value);
});

test('a tampered log fails integrity verification', async () => {
	const value = await log();
	const tampered = { ...value, peakLamport: 999 };
	expect(await decodeHeadLog(encodeHeadLog(tampered))).toBeUndefined();
});

test('generation bump produces a different integrity hash', async () => {
	const a = await log();
	const b = await buildCommitLog({ ...a, generation: 1 });
	expect(b.integrity).not.toBe(a.integrity);
});

test('malformed bytes decode to undefined', async () => {
	expect(await decodeHeadLog(new TextEncoder().encode('not json'))).toBeUndefined();
});
