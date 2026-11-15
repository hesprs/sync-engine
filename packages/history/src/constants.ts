/**
 * History Module Constants
 *
 * Centralizes time units, ingestion debounces, packfile assembly thresholds, sync triggers, storage
 * paths, binary framing headers, and tiered retention/GC policies.
 */

// ==========================================
// Time Units (milliseconds)
// ==========================================

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;

// ==========================================
// Local WAL & Edit Ingestion Cadence
// ==========================================

/**
 * Debounce delay (in ms) after user stops typing before capturing a draft into WAL. 15 seconds
 * allows natural pauses while coalescing typing bursts into coherent versions.
 */
export const TEXT_DEBOUNCE_MS = 15_000;

/**
 * Maximum wait time (in ms) during continuous typing before forcing a WAL commit. Prevents long
 * marathon editing sessions from leaving no recovery milestones for hours.
 */
export const TEXT_MAX_WAIT_MS = 120_000;

/** Debounce delay (in ms) for binary/attachment files before recording. */
export const NON_TEXT_DEBOUNCE_MS = 1000;

/** Maximum wait time (in ms) for binary/attachment files before forced commit. */
export const NON_TEXT_MAX_WAIT_MS = 5000;

// ==========================================
// Fast Channel & Remote Flush Thresholds
// ==========================================

/**
 * Minimum fast channel debounce floor (in ms). When negotiating with the main plugin's realtimeSync
 * setting, fast channel sync requests are delayed by at least Math.max(FAST_SYNC_DEBOUNCE_MS,
 * realtimeSync.value) to prevent prematurely interrupting the user's configured sync cadence. If
 * realtimeSync is disabled, the fast channel stays silent.
 */
export const FAST_SYNC_DEBOUNCE_MS = 1000;

/**
 * Base idle time (in ms) before uncommitted WAL entries are packed into an immutable .pack file.
 * Negotiates with realtimeSync so pack assembly aligns with longer sync intervals when configured.
 */
export const PACK_IDLE_MS = 30_000;

/** Maximum uncommitted revisions accumulated in WAL before immediately triggering a pack flush. */
export const MAX_PACK_REVISIONS = 20;

/** Maximum uncommitted payload volume (256 KB) before immediately triggering a pack flush. */
export const MAX_PACK_BYTES = 256 * 1024;

/** Maximum rolling pack window referenced directly in the device's head log. */
export const MAX_PACK_WINDOW = 32;

// ==========================================
// Retention, Settings & GC Policies
// ==========================================

/** Default maximum number of retained versions per note. */
export const DEFAULT_MAX_VERSIONS = 100;

/** Default maximum retention duration (in days) before older versions are purged. */
export const DEFAULT_RETENTION_DAYS = 90;

/** Minimum cooldown interval (24 hours) between automatic background GC runs. */
export const AUTO_GC_COOLDOWN_MS = DAY_MS;

/**
 * Tier 1 cutoff: Edits younger than 1 hour are preserved fine-grained to allow full undo of recent
 * work.
 */
export const TIER_RECENT_CUTOFF_MS = HOUR_MS;

/**
 * Tier 2 cutoff: Edits between 1 hour and 24 hours are thinned to at most 1 version per calendar
 * hour.
 */
export const TIER_HOURLY_CUTOFF_MS = 24 * HOUR_MS;

/**
 * Tier 3 cutoff: Edits between 1 day and 30 days are thinned to at most 1 version per calendar day
 * (capping monthly history to ~30 daily milestones). Edits older than 30 days are thinned to at
 * most 1 version per week.
 */
export const TIER_DAILY_CUTOFF_MS = 30 * DAY_MS;

// ==========================================
// Storage Keys, Prefixes & Packfile Framing
// ==========================================

/** Prefix for all remote history objects stored in S3/WebDAV. */
export const HISTORY_PREFIX = 'sync-engine-history/';

/** File extensions treated as mergeable plain text by the chunker. */
export const TEXT_EXTS = ['.md', '.canvas', '.txt', '.json', '.base'];

/** Key used in history database for persistent Lamport logical clock. */
export const LAMPORT_KEY = 'clock';

/** Key used in history database for the unique local device ID. */
export const DEVICE_ID_KEY = 'id';

/** Key used in history database for recording the last successful GC run timestamp. */
export const GC_TIME_KEY = 'time';

/** Packfile magic 4-byte header identifier (SEHP: 0x53454850). */
export const PACK_MAGIC = 0x53_45_48_50;

/** Packfile binary format version. */
export const PACK_VERSION = 1;

/** Fixed byte size of the packfile binary header. */
export const PACK_HEADER_BYTES = 128;

/** Flag bit in IndexEntry indicating a small inline note payload. */
export const FLAG_SMALL_FILE = 1;

/** Flag bit in IndexEntry indicating a file deletion tombstone. */
export const FLAG_DELETION = 2;

/** Flag bit in IndexEntry indicating a major milestone/checkpoint. */
export const FLAG_CHECKPOINT = 4;
