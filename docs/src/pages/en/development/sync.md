# Sync

Sync Engine's sync pipeline is extensible at three points: remote listing, decision-making, and conflict resolution. For the internal sync pipeline architecture, see [deep dive: sync](../deep-dive/sync).

## Remote Lister

A `RemoteLister` produces the remote file listing during sync. The plugin registers a normal traversal (priority 10000) and a realtime fast-mode candidate (priority 1000). Entries are evaluated in ascending order; the first result is used.

```ts
type RemoteLister = (
  info: Infras & { trigger: string; reporter: ListReporter },
) => MaybePromise<Array<Stat>>;

type RemoteListerEntry = {
  priority: number;
  apply: (info: Parameters<RemoteLister>[0]) => MaybePromise<Array<Stat>> | undefined;
};
```

`Infras` is `{ localFs: Fs; remoteFs: Fs; record: RecordStore }`. The `reporter` must be passed through to `remoteFs.list()` calls. For how listers integrate with the sync flow, see [deep dive: sync](../deep-dive/sync#remote-lister).

### Registering a Lister

See [registration](registration#remote-lister).

## Decider

A `Decider` compares local stats, remote stats, and prior records to produce sync tasks.

```ts
type DeciderInput = {
  localStats: StatsMap;
  remoteStats: StatsMap;
  records: RecordStatsMap;
  taskFactory: TaskFactory;
  logger: (log: string) => void;
};

type Decider = (input: DeciderInput) => Array<BaseTask>;
```

Use `taskFactory` instead of constructing task classes directly — their constructors require internal sync infrastructure. Built-in deciders include bidirectional, mirror-local, and mirror-remote; see [deep dive: sync](../deep-dive/sync#decider) for their behavior.

Examples: [bidirectional decider](https://github.com/hesprs/sync-engine/blob/main/packages/plugin/src/sync/decision/bidirectional.ts) and [mirror deciders](https://github.com/hesprs/sync-engine/blob/main/packages/plugin/src/sync/decision/mirror.ts).

### Registering a Decider

See [registration](./registration#decider).

## Conflict Resolver

A `ConflictResolver` handles files that conflict (both sides changed since last sync).

```ts
type ConflictResolverPayload = {
  local: FileStat;
  remote: FileStat;
  key: string;
  localFs: Fs;
  remoteFs: Fs;
  record: RecordStore;
};

type ConflictResolver = (payload: ConflictResolverPayload) => MaybePromise<void>;
```

```ts
import { pipe } from '@hesprs/sync-engine-sdk';

// Simple resolver that writes remote content to local
const resolver: ConflictResolver = async ({ key, localFs, remoteFs, remote }) => {
  await pipe({ from: remoteFs, to: LocalFs, key, fileStat: remote });
};
```

### Registering a Conflict Resolver

See [registration](./registration#conflict-resolver).

## Transfer Utilities

Three helpers exported from `@hesprs/sync-engine-sdk` for copying file content between filesystems with automatic size-based streaming.

### `pipe`

```ts
import { pipe } from '@hesprs/sync-engine-sdk';

function pipe(options: { from: Fs; to: Fs; key: string; stat: FileStat }): Promise<void>;
```

Reads a file from `from` and writes it to `to` under the same `key`. Automatically selects buffered or streaming mode based on file size (2.5 MiB threshold). Silently succeeds if the source file does not exist (swallows TOCTOU 404 / `ENOENT` errors).

```ts
await pipe({ from: remoteFs, to: localFs, key: 'folder/note.md', stat });
```

### `readWithSize`

```ts
function readWithSize(
  fs: Fs,
  key: string,
  stat: FileStat,
): MaybePromise<Binary | ReadableStream<Binary> | undefined>;
```

Reads a file, choosing `readStream` for files larger than 2.5 MiB and `read` otherwise. Returns `undefined` if the file does not exist. The `stat` parameter is forwarded to the chosen `Fs` method as required by the interface.

### `writeWithValue`

```ts
function writeWithValue(
  fs: Fs,
  key: string,
  value: Binary | ReadableStream<Binary>,
  stat: FileStat,
): MaybePromise<string>;
```

Writes a value to `fs`, choosing `writeStream` for `ReadableStream` inputs and `write` for `Binary` inputs. Returns the uid from the underlying write call. The `stat` parameter is forwarded as required by the interface.

## Task Types

All task types extend `BaseTask` and are type-only exports. `TaskFactory` accepts task-specific options; every task requires `key`.

```ts
type TaskNames =
  | 'addRecord'
  | 'removeRecord'
  | 'createLocalDir'
  | 'createRemoteDir'
  | 'download'
  | 'resolveConflict'
  | 'removeLocal'
  | 'removeRemote'
  | 'upload'
  | 'moveLocal'
  | 'moveRemote';

type TaskFactory = <N extends TaskNames>(
  name: N,
  options: TaskOptionsMap[N],
) => InstanceType<(typeof taskMap)[N]>;
```

| Type              | Required options beyond `key`                                       | Operation                                                                                         |
| ----------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `AddRecord`       | `local: Stat`, `remote: Stat`                                       | Creates record for both sides. File records contain both UIDs; directory records contain `isDir`. |
| `RemoveRecord`    | None                                                                | Deletes sync record without changing either filesystem.                                           |
| `Download`        | `remote: FileStat`                                                  | Copies remote file to local filesystem and records both UIDs.                                     |
| `Upload`          | `local: FileStat`                                                   | Copies local file to remote filesystem and records both UIDs.                                     |
| `CreateLocalDir`  | `remote: FolderStat`                                                | Creates local directory and its sync record.                                                      |
| `CreateRemoteDir` | `local: FolderStat`                                                 | Creates remote directory and its sync record.                                                     |
| `RemoveLocal`     | `local: Stat`                                                       | Deletes local path and its sync record.                                                           |
| `RemoveRemote`    | `remote: Stat`                                                      | Deletes remote path and its sync record.                                                          |
| `MoveLocal`       | `oldKey: string`, `remote: Stat`                                    | Moves local path from `oldKey` to `key` and moves its record.                                     |
| `MoveRemote`      | `oldKey: string`, `local: Stat`                                     | Moves remote path from `oldKey` to `key` and moves its record.                                    |
| `ResolveConflict` | `local: FileStat`, `remote: FileStat`, `resolver: ConflictResolver` | Invokes resolver with both file states and sync infrastructure.                                   |

## `SyncTerminateReason`

This is the return type of `ctx.requestSync`, `ctx.executeSync`, and the payload of `syncTerminated` event.

```ts
type SyncTerminateReason =
  | { result: 'cancelled' }
  | { result: 'completed' }
  | { result: 'failed'; error: string }
  | { result: 'noop' };
```
