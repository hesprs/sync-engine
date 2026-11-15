/**
 * Collaboration Module Constants
 *
 * Centralizes timing intervals, debounce windows, TTL windows, payload limits, and cryptographic
 * parameters for realtime collaboration pulse signaling.
 *
 * Design Invariant: Storage is the single source of truth. Collaboration operates exclusively as an
 * ephemeral signaling (pulse) layer over MQTT, never carrying file content.
 */

// ==========================================
// Timing, Debounce & Life-cycle Constants
// ==========================================

/**
 * Debounce delay (in ms) for processing incoming pulse messages in SyncBridge before triggering an
 * incremental sync against remote storage.
 */
export const DEFAULT_PULSE_DEBOUNCE_MS = 1500;

/**
 * Time-to-live (in ms) for deduplication of received pulse message IDs. Messages older than 5
 * minutes are discarded to prevent replay attacks.
 */
export const SEEN_TTL = 300_000;

/**
 * Maximum clock skew tolerance (in ms) when evaluating timestamp freshness. Messages stamped
 * farther in the past or future than 2 minutes are dropped.
 */
export const MAX_CLOCK_SKEW = 120_000;

/**
 * Time window (in ms) to track recent remote uploads in RaceJournal. Used to detect concurrent
 * upload races from peers and avoid false overwrites.
 */
export const RACE_WINDOW = 30_000;

/** Maximum time (in ms) to wait for an MQTT connection / subscription to settle. */
export const MQTT_CONNECT_TIMEOUT_MS = 15_000;

/** Maximum time (in ms) to wait for an MQTT publish acknowledgment before timing out. */
export const MQTT_PUBLISH_TIMEOUT_MS = 15_000;

// ==========================================
// Protocol, Buffer & Payload Limits
// ==========================================

/** Wire protocol version for collaboration envelopes. */
export const PROTOCOL_VERSION = 1;

/** Default secret ID for storing collaboration room secrets in the credential store. */
export const DEFAULT_SECRET_ID = 'sync-engine-collaboration';

/** Maximum entries retained in the deduplication cache for seen message IDs. */
export const MAX_SEEN_CACHE = 8192;

/** Maximum entries retained in the concurrent upload race journal. */
export const MAX_JOURNAL_ENTRIES = 4096;

/** Prefix applied to dynamic deciders registered by the collaboration module. */
export const WRAPPER_PREFIX = 'collaboration:';

/**
 * Maximum ciphertext size (in bytes) for a pulse envelope. A pulse is a single small ciphertext;
 * this bounds absurd messages from the broker.
 */
export const MAX_CIPHERTEXT_BYTES = 4096;

/**
 * Maximum plaintext size (in bytes) for a pulse envelope payload. AES-GCM adds a 16-byte tag; the
 * rest is reserved for JSON framing.
 */
export const MAX_PLAINTEXT_BYTES = MAX_CIPHERTEXT_BYTES - 16 - 64;

/** Upper bound on changed keys carried in one pulse envelope, independent of the byte budget. */
export const MAX_CHANGED_KEYS = 512;

// ==========================================
// Cryptographic Parameters
// ==========================================

/** Prefix for serialized human-shareable room codes. */
export const ROOM_CODE_PREFIX = 'sec1';

/** Byte length of the room ID random entropy. */
export const ROOM_ID_BYTES = 16;

/** Byte length of the room secret shared key. */
export const ROOM_SECRET_BYTES = 32;

/** Byte length of AES-GCM Initialization Vector (nonce). */
export const NONCE_BYTES = 12;

/** Byte length of derived message encryption key. */
export const MESSAGE_KEY_BYTES = 32;

/** Byte length of derived topic authentication key. */
export const TOPIC_KEY_BYTES = 32;

/** PBKDF2 iteration count for deriving master room key from secret. */
export const KEY_DERIVATION_ITERATIONS = 210_000;

/** Domain-separation salt for key derivation. */
export const CRYPTO_SALT = 'sync-engine-collaboration/v1';

/** HKDF / PBKDF2 info string for message encryption key. */
export const ENCRYPTION_INFO = 'message-encryption';

/** HKDF / PBKDF2 info string for topic derivation key. */
export const TOPIC_INFO = 'topic';
