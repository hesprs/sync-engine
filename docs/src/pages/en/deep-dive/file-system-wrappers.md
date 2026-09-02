# File System Wrappers

A wrapper is a factory function around a [file system](./file-system) `Fs` instance that intercepts the behavior of the original FS. A wrapper function receives the original FS in the first argument and returns an `Fs`. Overlay wrappers return a `WrappedFs` with an `original` member; injection wrappers modify the supplied FS and return it. Infinite layers of overlay wrappers can be applied to the same FS instance.

The SDK's canonical `prefixWrapper` API and usage example are documented in [development: file system](../development/file-system#prefixwrapper).

The root FS without any wrappers is typed `RootFs`. `Fs` is the union of `RootFs` and `WrappedFs`.

There are two kinds of wrappers:

- **Injection wrapper**: changes some methods of the supplied FS by directly re-assigning public members. Does not produce a new layer.
- **Overlay wrapper**: most common, applies a new layer of wrapper at the top of original FS.

## Memory Control Wrapper

- Target: local and remote `Fs`
- Priority: `1000` for both

Applied on both local and remote. The wrapper receives a shared `MemoryControlSharedState` containing `memoryConsumption`, `hangingOperations`, and `maxMemory`.

`hangingOperations` pool is kept sorted in descending order by transfer size (`stat.size`), so longer transfers resume before shorter ones. This front-loads large files across the whole sync instead of deferring them into an underutilized tail.

Only intercept `read`, `readStream`, `write`, `writeStream` calls:

1. When `read()` and `readStream()` arrive, reserve `min(stat.size, 16 MiB)`. If memory is unavailable, put the operation into the sorted pool and delay it. On failure, release the reservation and resume queued operations. When consumption is zero, one operation may exceed `maxMemory`.
2. `write()` and `writeStream()` do not reserve memory. When either finishes or fails, release `min(stat.size, 16 MiB)`, then resume queued reads when memory allows.

When resuming, the wrapper scans the whole pool and admits every operation that fits, skipping larger ones that do not. This backfilling keeps leftover budget packed with smaller transfers instead of stalling behind a single oversized operation.

## Optimization Wrapper

- Target: local and remote `Fs`
- Priority: `2000` for both
- Mechanism: `setTimeout(..., 0)`-scheduled atom queue

### Optimization Companion Wrapper

- Target: local and remote `Fs`
- Priority: `21000` for both
- Behavior: injects `read()` and `readStream()` methods that add keys to the opposite-side optimization pool and probe the opposite-side FS.

### Backend-Dependent Optimization

Sync routines must remain backend-independent, but optimal execution strategies vary (e.g., WebDAV requires sequential parent directory creation; S3 allows concurrent uploads). This wrapper decouples logic from optimization by intercepting FS API calls at the root layer to reorder, batch, or schedule execution within promises.

Backends may extend `RootFs` with backend-specific methods. The batch optimizer can receive the FS via `instanceof` check and use those methods.

### Operation Coalescing

Coalescing uses a zero-delay timer: mutations are queued synchronously, and the timer flush captures operations added before it runs. The optimization wrapper keeps separate `Set<string>` pools for local and remote keys.

**Interception Rules**:

1. Mutations (`delete`, `mkdir`, `move`): Enqueued as `InputAtom`s.
2. Reads (`read`, `readStream`): The companion wrapper adds `stat.key` to the opposite-side `Set` and probes that FS with the same key and stat. The opposite-side optimization wrapper consumes a matching needle, records its transformed key, and terminates the probe.
3. Writes (`write`, `writeStream`):
   - Reuses deferred execution if a pending anticipated write exists for the delegated key.
   - Passes through otherwise.
4. Pass-through: ordinary `read` and `readStream` calls, plus `getUid`, `stat`, `exists`, and `list`, delegate to the original FS. Reads still intercept matching needle probes. `checkConnection` belongs to the remote backend entry, not `Fs`.

**Execution**:

On timer flush, the wrapper drains queued atoms and transformed keys into synthetic `write` atoms. Each anticipated write is stored in a key-based pending-write map; the later `write()` or `writeStream()` for that key supplies its real execution and reuses the deferred promise. These atoms are passed to the injected `batchOptimizer`. Single-atom queues execute directly without batching. Queued atoms share real execution and deferred promises via `createCachedPromise()`.

Every input atom has `resolve` and `reject` callbacks. Optimizers must propagate operation failures by rejecting the affected atoms, including when a custom atom replaces them or a batch returns per-key failures. Removed atoms must always be settled, or their original promises remain pending.

## Asymmetric Storage Wrapper

- Target: remote `Fs`
- Priority: `11000`, only when asymmetric storage is enabled

Applied to the remote FS when asymmetric storage is enabled. It flattens hierarchical file and folder keys into anchored keys, then restores hierarchical stats and progress after delegation. Folders are represented by empty files. See the [Asymmetric Storage specification](./asymmetric-storage).

## Context Wrapper

- Target: local and remote `Fs`
- Priority: `20000` for local; `10000` and `20000` for remote

Intercepts `list()`, `stat()`, `write()`, `writeStream()`, `delete()`, `move()`, and `mkdir()` calls, and builds a copy of best-effort known stats in a `uni-kv` memory store that survives sync runs.

`read()` and `readStream()` pass through unchanged. File stats are required by the FS interface.

Bootstrap uses these stores:

- `localContext20000`
- `remoteContext10000`
- `remoteContext20000`

Behavior:

- On `stat()`, upsert the returned stat into the KV store
- On `list()`, clear the store and reset according to the list result
- On `write()` or `writeStream()`, upsert the supplied stat with the returned UID
- On `delete()`, delete the record.
- On `move()`, move the cached record to the new key and modify its `key` field.
- On `mkdir()`, upsert folder record.
- All memory database mutation should only happen when original operation succeeds and returns.
- When the wrapper is created, compare its marker with the current FS UID. If they differ, clear the store and update the marker.

## Cancellation Wrapper

- Target: local and remote `Fs`
- Priority: `3000` for both

Receive `isCancelled: Ref<boolean>` in the second argument to detect sync cancellation.

Intercept all `Fs` methods except `getUid()`. Wrap all method calls with a throw if cancelled at before and after relaying. Special cases: only check cancellation **before** `read()` & `readStream()` and **after** `write()` & `writeStream()` to prevent cancellation race blocking memory control counter release.

## Debug Wrapper

The development-only `debugWrapper` overlays an FS and logs every method call. It is exported from the SDK development entrypoint and is not part of the runtime wrapper chain.

### Prefix Wrapper

`prefixWrapper` is an importable SDK wrapper for exposing a directory as the root of another `Fs`:

Its type is `prefixWrapper(original: Fs, prefix: string): WrappedFs`.

The wrapper normalizes `prefix` as a unified directory key: Unicode is normalized, percent-encoded path segments are decoded, empty slash segments are removed, and a trailing `/` is added. It prepends the normalized prefix when delegating file-system operations. Returned stat keys, list results, and list progress paths have the prefix removed; the wrapped directory itself is exposed as `/` and omitted from recursive list results. A returned path outside the prefix is rejected with an error.
