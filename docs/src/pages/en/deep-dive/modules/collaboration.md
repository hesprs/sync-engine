# Collaboration Module

Collaboration is an optional realtime notification layer. It does not replace the configured remote backend: after a sync changes remote state, a device publishes a small encrypted _pulse_ over MQTT. The pulse lists only the file keys that changed in that sync, so peers can refresh just those keys against the backend instead of walking the whole vault on every notification.

The module registers a remote file system wrapper, a sync trigger, settings, and a conflict resolver that routes concurrently overwritten files into the configured merge strategy. The pulse carries no file content, UIDs, sizes, or rules — only the changed keys, inside the encrypted payload. The vault's full structure never travels over the broker.

## Room Code and Keys

A room code is generated once and stored in Obsidian's secret storage. It has the form `sec1.<room-id>.<secret>`, where the room ID is 16 random bytes and the secret is 32 random bytes, both encoded as base64url.

Every client derives the same keys from the room code:

- `PBKDF2-SHA-256` with 210,000 iterations derives a master secret from the room secret.
- The salt is `SHA-256("sync-engine-collaboration/v1:<room-id>")`.
- `HKDF-SHA-256` derives a 32-byte encryption key and a 32-byte topic key from the master secret.
- The MQTT topic is `sync-engine/collaboration/v1/<base64url(HMAC-SHA-256(topic-key, room-id))>`.

The room ID is therefore public inside the room code, while the topic key and encryption key are not. A client that knows the topic cannot decrypt messages without the room secret.

## Message Flow

Each client tracks a `dirty` flag and a set of changed keys per remote backend, both set whenever a local sync writes, moves, deletes, or creates something on the remote backend. A publish happens only when that flag is set, the transport is connected, and a remote UID is known. The flag and the key set are cleared after the pulse is sent, guarded by a revision counter so a write made during publishing is not lost.

The encrypted payload contains a timestamp and, when it fits, the changed keys. The key set is bounded by both a maximum count and a byte budget (the ciphertext must stay under 4096 bytes). A batch that exceeds either bound degrades to a keyless pulse, which asks peers to do a full remote walk instead. All framing metadata lives in the MQTT 5 PUBLISH variable header as User Properties — `v`, `client_id`, `batch_id`, and `sent_at` — so the PUBLISH payload carries only `nonce` and `ciphertext`, and the changed keys stay inside the encrypted bytes. Brokers can identify the sender without touching the encrypted bytes. Credentials for authenticated brokers are read from Obsidian's secret storage at connect time.

A pulse is a single small message sealed with `AES-GCM-256`. The additional authenticated data binds the topic, batch ID, client ID, and timestamp; because the User Properties feed that AAD, tampering with them makes the message fail to decrypt. There is no compression, chunking, or reassembly.

Messages outside a two-minute clock window are rejected. Duplicate `batchId` values are ignored, and the receiver drops pulses whose `client_id` matches its own. Message size depends on the size of the change batch, not on the total number of files in the vault.

## Applying a Pulse

When a pulse arrives, the sync bridge compares its timestamp and batch ID with any pending pulse and keeps the newer one. It requests a collaboration-triggered sync.

The sync core needs a _complete_ remote listing: a key missing from it is treated as a remote deletion and would remove the local file. So the trigger supplies a `remoteLister` built from the cached remote snapshot that the core's context wrapper already maintains in memory. Starting from that complete snapshot, it re-stats only the keys named in the pulse against the real backend and patches the snapshot, then returns the full array. This keeps the network cost proportional to the number of changed keys while the deciders still see the whole remote state.

A full remote `list('/')` is still used when the local snapshot has never been populated (for example just after startup) or when the receiver gets a keyless pulse. That walk also initializes file system wrappers such as [asymmetric storage](../asymmetric-storage) before any download and refreshes the snapshot. Scheduled and startup syncs do the same, so a peer that was offline and missed several pulses heals its snapshot through the next full walk rather than relying on a continuous pulse sequence. Because both peers read the same backend, no stat list needs to be shipped.

## Race Detection

A concurrent upload can overwrite a file this device just uploaded. The module does not try to prevent that race; it detects it and lets the configured conflict resolver merge the divergent versions. Every edit is already captured durably by the [history versions](./history) module, so no in-memory ledger or replay is needed.

The module journals recent uploads. During a collaboration-triggered sync, the wrapped decider checks the real remote listing: a changed UID for a recently uploaded key within the race window forces a conflict. That forced record routes the key into the configured conflict resolver, which merges both sides instead of silently dropping one. Rules whose strategy is `none` or already wrapped by the module are left unchanged.

## Settings

| Setting | Behavior |
| --- | --- |
| Enable collaboration | Connects to the broker and starts publishing and accepting pulses. |
| Broker URL | MQTT WebSocket URL. The default is the public EMQX broker. |
| Broker username | Optional username for authenticated brokers, stored in plain text. |
| Broker password | Optional. Selects a secret from Obsidian's secret storage for brokers that require authentication. |
| Client ID prefix | Prefilled with the Obsidian device type on first run and editable. A random suffix is added for each session so copied settings do not collide. |
| Room code | Selects a secret from Obsidian's secret storage. Generate and Copy actions are provided. |
| Topic | Copies the room topic to the clipboard with the button; no topic text is shown. |

The status row reports the current transport state and a broker error when one is available. Reconnect applies the current settings immediately.

## Security and Privacy

The broker sees the topic, packet timing, encrypted packet sizes, and the plaintext User Properties (`client_id`, `batch_id`, `sent_at`, `v`). It cannot read the changed-key names: they sit inside the `AES-GCM-256` ciphertext, not in the User Properties, and it sees no UIDs, sizes, rules, or file content. A holder of the room secret can decrypt a captured pulse and learn the names of the files changed in that batch, but never the vault's full structure or any file content. This is the deliberate trade-off against a keyless design: the broker itself learns nothing about files, while a leaked room code exposes the changed names of the pulses an attacker managed to capture, rather than only packet timing. The topic is derived from the room secret, so an observer cannot discover it from the room ID alone.

The room secret is the only credential. Anyone with the room code can join, decrypt pulses, and publish them. The module does not provide member management, key rotation, revocation, forward secrecy, or protection against a member replaying an old pulse within the freshness window.

The public default broker is suitable for testing and for metadata that users accept exposing to the broker. Users who need a private relay should configure their own MQTT WebSocket endpoint.

## Limits and Compatibility

- MQTT 5 over WebSocket is required.
- A pulse is a single small message; its size depends on the change batch, not on the vault size. An oversized batch degrades to a keyless pulse and a full remote walk on the receiver. There is no chunking or reassembly.
- Incremental sync relies on the in-memory remote snapshot. A receiver with an unpopulated snapshot (cold start) or a keyless pulse falls back to a full remote walk, which refreshes the snapshot. Missed pulses while offline are healed by such a walk, not by a replayed sequence.
- Collaboration assumes every device uses the same remote backend and comparable sync rules. Different backends can produce different UIDs and are not a supported sharing setup.
- The module uses the browser build of `mqtt`; no Node.js APIs are used.
- This is file-level race detection, not character-level collaborative editing. Concurrent edits go through the configured conflict resolver.
