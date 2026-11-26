import type { HistoryTranslations } from '@/i18n';
import type { HistoryDatabase } from '@/store';
import type {
	Context,
	Dispatch,
	Events,
	ObsidianLanguageCode,
	On,
	SelectFromContext,
	SettingEntry,
	SyncTerminateReason,
	Translate,
	TranslationResource,
} from '@hesprs/sync-engine-sdk';
import type { GlobStrategy } from '@repo/shared/glob-match';
import type { App, Command, EventRef } from 'obsidian';

export type ChunkRef = {
	hash: string; // Full SHA-256 of chunk bytes
	offset: number; // Byte offset into the inflated payload
	length: number;
};

export type BlobRef = {
	hash: string;
	key: string; // Unified key, NFC normalized
	size: number;
};

export type PackRef = {
	deviceId: string;
	seq: number;
	hash: string;
	fromLamport: number;
	toLamport: number;
};

/** Fixed prefix of every .pack. `hash` is also embedded in the filename. */
export type PackHeader = {
	magic: number;
	version: number;
	ns: string;
	deviceId: string;
	seq: number;
	baseLamport: number;
	peakLamport: number;
	createdAt: number; // Unix ms
	commitCount: number;
	indexOffset: number;
	indexLength: number;
	payloadOffset: number;
	payloadLength: number;
	codec: Codec;
	hash: string;
};

export type Codec = 'deflate' | 'raw';

/** One logical version. The chunk list IS the delta: unchanged chunks are references. */
export type IndexEntry = {
	keyHash: string; // SHA-256 of the normalized unified key
	key: string;
	lamport: number;
	deviceId: string;
	at: number; // Unix ms
	parents: Array<string>; // DAG parent commit hashes, empty for a root
	chunks: Array<ChunkRef>; // Ordered; empty for a small-file or deletion
	blobs: Array<BlobRef>;
	inlineOffset?: number; // Set when the note is stored as whole text
	inlineLength?: number;
	flags: number; // Bit 0 small-file, bit 1 deletion, bit 2 checkpoint
	hash?: string; // Content fingerprint for fast zero-cost version deduplication
};

/** Per-device head log. Single writer; `generation` detects stale mirrors. */
export type CommitLog = {
	deviceId: string;
	ns: string;
	seq: number; // Last published pack seq
	peakLamport: number;
	generation: number;
	packs: Array<PackRef>; // Recent window, oldest first
	chunkIndex: Record<string, string>; // Chunk hash → packRef key, recent window
	heads: Array<string>; // Current DAG tip commit hashes
	updatedAt: number;
	integrity: string; // SHA-256 of the log minus this field
	remoteUid?: string; // Remote storage UID/ETag for zero-cost reconcile short-circuit
	incomplete?: boolean; // Local-only marker when some packs failed to index and must be retried
};

/** WAL record. Persisted before an edit is considered captured. */
export type WalEntry = {
	seq: number;
	key: string;
	lamport: number;
	at: number;
	parent: string;
	parents?: Array<string>; // Set for a DAG merge commit (multiple tips)
	text?: string; // < 4 KiB note
	chunkHashes?: Array<string>; // >= 4 KiB note
	newChunks?: Array<{ hash: string; bytes: Uint8Array }>;
	blobs?: Array<BlobRef>;
	blobData?: Array<{ hash: string; bytes: Uint8Array }>;
	flushedPack?: string; // Set only after head rewrite succeeds
	flags?: number;
};

export type CommitLocation = { pack: PackRef; indexOffset: number; indexLength: number };
export type ChunkLocation = { pack: PackRef; offset: number; length: number };

export type FlushReason = 'idle' | 'count' | 'volume' | 'lifecycle';
export type VersionRef = { key: string; lamport?: number; commitHash?: string };
export type RestoreResult = {
	at: number;
	binary?: Uint8Array;
	key: string;
	lamport: number;
	merged: boolean;
	text: string;
};

/**
 * UI-facing version descriptor. `index` is per-file (1 = newest); `lamport` is the internal global
 * ordering key.
 */
export type VersionSummary = { key: string; lamport: number; at: number; index: number };

export {
	FLAG_CHECKPOINT,
	FLAG_DELETION,
	FLAG_SMALL_FILE,
	PACK_HEADER_BYTES,
	PACK_MAGIC,
	PACK_VERSION,
} from '@/constants';

export type TogglableValue<T = number> = { enabled: boolean; value: T };

export type HistoryContext = SelectFromContext<{
	addCommand: (command: Command) => Command;
	app: App;
	dispatch?: Dispatch<Events>;
	getNamespace: Context['getNamespace'];
	indexedDB: HistoryDatabase;
	on: On<Events>;
	registerEvent: (ref: EventRef) => void;
	registerI18n: (locale: ObsidianLanguageCode, resource: TranslationResource) => void;
	registerSetting: (entry: SettingEntry) => () => boolean;
	requestSync: (trigger: string) => Promise<SyncTerminateReason>;
	saveSettings: () => Promise<void>;
	settings: {
		modules: Record<string, object>;
		realtimeSync?: TogglableValue;
		syncStrategy?: Array<GlobStrategy>;
	};
	translate: Translate<HistoryTranslations>;
}>;

export type PendingDebounce = {
	data: Uint8Array;
	firstScheduledAt: number;
	timer: ReturnType<typeof setTimeout>;
};
