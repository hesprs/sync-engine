/**
 * Sync Engine Plugin Core Constants
 *
 * Centralizes default synchronization cadences, debounce delays, memory and concurrency budgets,
 * file size limits, and UI update intervals.
 */

// ==========================================
// Sync Cadence & Timing Defaults
// ==========================================

/**
 * Default delay (in ms) for startup sync after Obsidian's workspace layout is ready. 5 seconds
 * allows initial index and plugins to settle before initiating network sync.
 */
export const DEFAULT_STARTUP_SYNC_DELAY_MS = 5000;

/**
 * Default debounce delay (in ms) for realtime sync after vault file modifications. 5 seconds
 * provides a gentle batching window for multi-file operations.
 */
export const DEFAULT_REALTIME_SYNC_DELAY_MS = 5000;

/**
 * Default interval (in ms) for scheduled periodic sync. 5 minutes provides regular synchronization
 * for background changes.
 */
export const DEFAULT_SCHEDULED_SYNC_INTERVAL_MS = 300_000;

/**
 * Default minimum cooldown gap (in ms) required between focus sync runs. Prevents rapid switching
 * between apps/tabs from triggering redundant syncs.
 */
export const DEFAULT_FOCUS_SYNC_GAP_MS = 300_000;

// ==========================================
// Resource, Concurrency & Memory Budgets
// ==========================================

/**
 * Default maximum file size (in bytes) eligible for automatic synchronization (30 MB). Files
 * exceeding this threshold require explicit user opt-in or larger limit.
 */
export const DEFAULT_MAX_FILE_SIZE_BYTES = 31_457_280;

/**
 * Default maximum memory consumption budget (in bytes) for task execution (64 MB). Enforces
 * streaming and backpressure when operating on large vaults or files.
 */
export const DEFAULT_MAX_MEMORY_BYTES = 64 * 1024 ** 2;

/** Default maximum concurrent network requests permitted across the worker pool. */
export const DEFAULT_MAX_REQUEST_CONCURRENCY = 50;

// ==========================================
// UI, Observability & Logging Limits
// ==========================================

/** Delay (in ms) before auto-hiding the mobile sync completion notice. */
export const MOBILE_SYNC_NOTICE_HIDE_DELAY_MS = 2000;

/** Interval (in ms) for updating the "since last sync" UI relative timestamp text. */
export const SINCE_LAST_SYNC_UPDATE_INTERVAL_MS = 60_000;

/** Maximum number of sync log records retained in the circular log buffer. */
export const MAX_SYNC_LOGS = 100;
