import { assembleChunks, captureContent } from '@/chunker';
import { openHistoryStores } from '@/store';
import { expect, test } from 'bun:test';
import { openMemoryDB } from 'uni-kv';
import type { HistoryDatabase } from '@/store';

const encoder = new TextEncoder();

function setup() {
	const db = openMemoryDB(`history-chunker-${crypto.randomUUID()}`) as never as HistoryDatabase;
	return openHistoryStores(db, 'ns-test');
}

test('assembleChunks concatenates ordered chunk bytes back into text', () => {
	const parts = [encoder.encode('# Head'), encoder.encode('\n'), encoder.encode('Body')];
	expect(assembleChunks(parts)).toBe('# Head\nBody');
});

test('a single-byte edit keeps downstream chunks identical', async () => {
	const stores = setup();
	const original = new Uint8Array(32 * 1024);
	let state = 3;
	for (let i = 0; i < original.byteLength; i++) {
		state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
		original[i] = state & 0xff;
	}
	const edited = Uint8Array.from(original);
	edited[8000] ^= 0xff;
	const a = await captureContent(stores, 'note.md', original);
	const b = await captureContent(stores, 'note.md', edited);
	const aHashes = a.chunkHashes ?? [];
	const bHashes = b.chunkHashes ?? [];
	const shared = bHashes.filter((hash) => aHashes.includes(hash));
	expect(shared.length / bHashes.length).toBeGreaterThan(0.7);
});
