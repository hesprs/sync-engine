import { captureContent } from '@/chunker';
import { appendWal } from '@/store';
import { FLAG_DELETION } from '@/types';
import type { HistoryStores } from '@/store';
import type { WalEntry } from '@/types';

/** Reads the current DAG tip for a key; the parent of a new local edit. */
export function parentOf(entries: ReadonlyArray<WalEntry>, key: string): string {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry.key === key) return `${entry.key}@${entry.lamport}`;
	}
	return '';
}

/**
 * Captures one whole-file snapshot into the WAL. The batch persist is awaited before the edit is
 * considered captured, so a hard process kill after this resolves never loses the version.
 */
export async function ingestEdit(
	stores: HistoryStores,
	key: string,
	data: Uint8Array,
	seenLamport = 0,
): Promise<WalEntry> {
	const normalizedKey = key.normalize('NFC');
	const pending = await stores.pending.values();
	const parent = parentOf(
		pending.sort((a, b) => a.seq - b.seq),
		normalizedKey,
	);
	const content = await captureContent(stores, normalizedKey, data);
	return appendWal(
		stores,
		{ at: Date.now(), key: normalizedKey, parent, ...content },
		seenLamport,
	);
}

/** Captures a file deletion into the WAL. */
export async function ingestDeletion(
	stores: HistoryStores,
	key: string,
	seenLamport = 0,
): Promise<WalEntry> {
	const normalizedKey = key.normalize('NFC');
	const pending = await stores.pending.values();
	const parent = parentOf(
		pending.sort((a, b) => a.seq - b.seq),
		normalizedKey,
	);
	return appendWal(
		stores,
		{ at: Date.now(), flags: FLAG_DELETION, key: normalizedKey, parent },
		seenLamport,
	);
}
