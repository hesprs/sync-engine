# History Version Module

The History Version Module stores every edit of a note as an immutable, content-addressed commit and restores any historical version with a bounded number of remote requests. It is an optional module built on the SDK and backed only by passive object storage: it needs no server-side script, no distributed lock, and no atomic append. It uses a dedicated handle below the [encryption](./encryption) wrapper so that remote object names stay literal content hashes; when encryption is enabled the object contents are encrypted at rest.

The design is CDC + a content-addressed object pool + sealed pack files. The newest state and the history are separate channels, so second-level editing never waits on history I/O.

## Goals and Non-Goals

Goals are second-level perceived sync of the newest state, zero-loss capture of every micro-edit (including after a hard process kill), immutable remote writes that never let concurrent devices overwrite each other, restore of any version in O(1) remote round trips, and chunk-level deduplication across versions, notes, and devices.

Character-level collaborative editing is not a goal: the vault `modify` event yields whole-file snapshots, so the module works at file and chunk granularity. It does not replace the configured remote backend or the record store (see [Sync](../sync) and [File System](../file-system)), and does not perform server-side garbage collection. When [encryption](./encryption) is enabled, history **contents** are encrypted (see [Encryption Compatibility](#encryption-compatibility)); object names stay literal.

## Design Invariants

Four invariants carry the whole design.

1. **Every remote object name is self-certifying.** A name contains either a content hash or a device-scoped monotone sequence plus a payload hash. Two devices never target the same name, so multi-device safety needs no `If-Match`, ETag preconditions, or bucket versioning — none of which the `RootFs` interface exposes (see [File System Wrappers](../file-system-wrappers)).
2. **The local WAL is the source of truth until a pack is acknowledged.** An edit is durable only after its WAL entry is persisted; no in-memory staging is authoritative.
3. **The newest state and the history have separate lifecycles.** Neither gates the other: a failed history flush never delays an upload, and a failed fast upload never loses a WAL entry.
4. **A commit is a chunk list, not a patch.** Restore reads one commit and the referenced blobs; delta efficiency comes from chunk reuse, not from replaying textual diffs.

## Dual-Channel Data Flow

On every vault `modify`, the module awaits a WAL append keyed by a monotone sequence and stamped with a Lamport clock (`max(local, seen) + 1`). Independently, a roughly one-second debounced fast path asks the sync core to upload the live note, and the [Collaboration](./collaboration) pulse tells peers to pull. A flush predicate — idle for 30 seconds, 20 revisions, 256 KiB uncompressed, or lifecycle exit — triggers the slow history channel. The fast path reuses the existing upload task, so mtime/ctime metadata and the record store stay consistent; no remote listing happens on the save path.

A flush snapshots the pending WAL into an immutable batch, splits content, deduplicates chunks against the local chunk index, assembles commits sorted by `(lamport, deviceId, keyHash)`, and writes one pack. The write ordering is **blobs → pack → head → WAL commit**: blob and pack writes are content-addressed and idempotent, the head log has a single writer, and WAL entries are deleted last so every earlier step is replayable. Replaying the same batch reproduces identical bytes and the same pack name.

On cold start the module replays any pending WAL, reads the head logs (one listing), and reconciles orphan packs from a per-device pack listing (one request per device). A pack that was written but whose head log was not yet rewritten is therefore promoted to the index without reading any object: the filename already carries its sequence and payload hash. This bounded repair path satisfies the ban on scanning the full remote.

## Local Persistence and Remote Layout

Six `uni-kv` stores are namespaced by the vault/remote pair: a pending WAL, a chunk-to-location CAS index, a version-to-index lookup, a mirror of remote head logs, a confirmed-blob set, and the persisted Lamport clock. Each WAL entry carries its own Lamport value, so a single `store.batch` on the pending store is the atomic durability boundary for both the edit and its clock bump. Observed remote peaks are folded back into the clock during reconciliation.

Remote objects live under a literal `.sync-engine-history/<namespace>/` prefix with three subfolders: `packs/<deviceId>/p-<seq>-<hash>.pack`, `blobs/<sha256>.blob`, and `heads/<deviceId>.log`. There is deliberately no `objects/` directory: chunk objects exist only as byte ranges inside packs. Each device is the sole writer of its own head log, which stays small by carrying only a recent window of pack references and a compact chunk map.

## Chunking and Deduplication

At WAL ingestion, content is routed by size. Notes below 4 KiB skip CDC and are stored inline as whole text with a whole-file hash; larger notes are split by FastCDC (min 512 B, average 1–2 KiB, max 4 KiB); binary attachments above 5 MiB become standalone blobs without CDC. The gear hash is hand-written in `packages/shared` and stays dependency-free and mobile-safe. All content hashing uses WebCrypto SHA-256; the 32-bit FNV-1a namespace hash is never used for content addressing.

Chunk identity is the full SHA-256 of the chunk bytes. Before a chunk is appended to a pack, its hash is looked up in the chunk index; only unseen bytes are written, giving cross-version, cross-note, and cross-device dedup. The concatenated payload is compressed with `fflate`, not per chunk, so shared chunks stay byte-identical and verifiable.

## Immutable Packfile Format

A pack is a single binary file written once and never modified: a fixed 128-byte header, a length-delimited sorted index of commit entries, and a deflated payload holding small-file texts, chunk bytes, and inline blobs. The header carries the index and payload offsets and lengths, so restore can parse the index without inflating the payload. The pack hash is SHA-256 over the header fields (excluding the hash), the index, and the payload; the same value appears in the filename, making the object self-certifying at listing time. A checkpoint entry stores a full chunk list with every chunk byte present in the same pack, emitted periodically so restore never needs to resolve chunks from more than a small bounded set of older packs.

## Multi-Device DAG and Deterministic Merge

Each commit names its parents. A device that edits while offline produces a chain whose parent is the last commit it saw; when it later reads another device's head log, the two chains form a DAG rather than overwriting one another. Ordering is total and deterministic by `lamport`, then `deviceId`, then `keyHash`, so all devices that have seen the same commits linearize identically with no negotiation or lock.

When two tips edit the same key, the merge is two-stage. First, chunk-sequence alignment treats each side's chunk-list as a token sequence and computes the LCS against the common ancestor with the ONP kernel extracted into `packages/shared`; unchanged chunk runs are reused directly. Second, the divergent runs are handed to a text-level three-way merge (see [Smart Merge](./smart-merge)). Restoring a multi-parent commit writes the merged text as a new WAL commit with both tips as parents; a fresh CDC pass then stores only its new chunks on the next flush. Conflict markers are still committed; nothing is silently discarded.

## Restore

A version pick resolves the commit location locally in O(1), fetches the pack, reads its index entry, resolves any missing chunks through the chunk index by fetching only the packs that hold them, skips attachments already confirmed present locally and fetches the rest, concatenates chunk bytes in order, inflates, and decodes UTF-8. A multi-parent target goes through the DAG merge above. Remote cost is one pack read, a small number of supplemental chunk-pack reads, and one GET per attachment, independent of how old the version is. A local index miss falls back to a head refresh, bounded per-device pack repair, and finally a full rebuild. Because the SDK `Fs` exposes whole-file reads but no Range reads, restore currently reads full packs; Range requests are a future optimization.

## User Interface

History is browsed per file, not from the global settings page. Right-clicking a Markdown file in the file explorer adds a **Sync Engine: Show history** item (prefixed so it cannot collide with other plugins) that opens a version browser for that file only. The browser lists the file's versions newest first, each labelled by its timestamp — the global Lamport clock is an internal ordering key and is never exposed. The newest version is preselected so its read-only preview is immediately visible. Cancel and Restore share a single row; the first Restore click reveals a confirmation line and the second writes back to the current file. Settings hold only global options — retention days and a manual garbage-collection button.

## Storage Isolation and Registration

History keys must stay literal so content hashes deduplicate correctly. The [Asymmetric Storage](../asymmetric-storage) wrapper flattens keys with anchors and the encryption wrapper obfuscates them, so the module does not register a file system wrapper into the sync stack. At `syncInitialized` it receives the run's `remoteFs`, walks to the root with `digOriginal`, and applies `prefixWrapper` on the history prefix. The resulting handle skips the asymmetric, context, optimizer, and encryption wrappers while still passing through the backend's request middleware (so S3 and WebDAV requests are signed correctly), and stays invisible to the sync core's listing so history objects never trigger deletion decisions. Registration is the standard set of settings, i18n, a vault `modify` listener, a workspace `file-menu` listener, and a `syncInitialized` subscription; no core type or `RootFs` signature changes are required (see [Extensibility](../extensibility)). Skipping the encryption wrapper is safe because object contents are encrypted independently, as described in [Encryption Compatibility](#encryption-compatibility).

## Encryption Compatibility

The dedicated handle deliberately bypasses the encryption wrapper, so history would otherwise be stored as plaintext while vault files are encrypted. To avoid that, the module detects whether [encryption](./encryption) is enabled (via the encryption module's settings and the password in Obsidian secret storage) and derives an independent AES-GCM key from that password using PBKDF2 with a module-specific salt. The key derivation is intentionally separate from the encryption module's own argon2id/HKDF derivation, so the same password never produces a reused key across two protocols.

Every object written through the handle — packs, blobs and head logs — is encrypted at the PUT boundary and decrypted at the GET boundary. Remote object **names remain literal** (`p-<seq>-<hash>.pack`, `<sha256>.blob`, `<deviceId>.log`), preserving self-certifying names, content-hash deduplication and cross-device orphan discovery. Encrypted objects carry a magic prefix (`SEHPC1`); any payload without this header fails fast with an explicit error. If encryption is enabled but its password is missing, the module keeps the remote handle unset so no plaintext history can be written at all. Changing the encryption password makes previously encrypted objects undecipherable; the module reports this as an explicit error rather than returning garbage. Object names are not obfuscated, so the set of stored content hashes remains visible metadata — note contents never are.

## Failure Matrix

| Failure | Recovery |
| --- | --- |
| Kill before WAL persist | Unavoidable at this boundary; the persist is awaited before capture is acknowledged |
| Kill after WAL persist | Non-empty WAL at cold start is replayed; the pack PUT is idempotent |
| Pack PUT done, head rewrite failed | Per-device pack listing promotes the orphan without object reads |
| Torn or stale head log | Integrity mismatch or generation regression triggers re-read and listing fallback |
| Concurrent devices write the same key | Different device path segments; DAG merge on read |
| Duplicate flush replay | Identical pack name and bytes |
| Missing blob or local index miss | Refetch or head refresh → bounded repair → full rebuild |
| Encryption password changed | Encrypted objects fail to decrypt with an explicit error; no garbage content is returned |
| Encryption enabled without a password | The remote handle stays unset, so no plaintext history is written |
| Fast-channel upload failure | Independent of WAL; retried on next sync or pulse |

## Retention and Garbage Collection

Retention is client-side and explicit, governed by both a maximum version count per note (`maxVersions`, default 100) and an age cutoff (`retentionDays`, default 90). Compaction sorts commits descending by Lamport clock/timestamp per file, retains up to `maxVersions` within the retention window, rewrites those live chunks into a new immutable pack with checkpoint entries, publishes a new head log, prunes obsolete entries from local index, and deletes packs that contain no live versions. A pack is never mutated in place, and the operation is idempotent.

## Collaboration

The module captures every edit durably, so the volatile in-memory edit ledger and automatic replay in [Collaboration](./collaboration) are no longer needed: a concurrent overwrite becomes a DAG branch rather than data loss, and automatic replay would write an already-archived version back onto the mainline. Collaboration keeps its pulse, race detection, and forced-conflict routing into the configured merge strategy, while this module owns where versions live and how they are retrieved.

## Implementation Discipline

The module uses `undefined`, not `null`, takes `Context` structurally, keeps module-specific behavior out of plugin core, and uses no Node.js APIs (see [Project Discipline](../discipline)). Data is normalized once at ingestion: keys NFC-normalized, sizes in bytes, timestamps in Unix milliseconds.
