# File System

Sync Engine uses a unified file system interface across all backends. Wrappers act as middleware above this interface.

## Core Data Types

```ts
type Binary = Uint8Array<ArrayBuffer>;
type MaybePromise<T> = T | Promise<T>;

type Progress<T = string> = {
  total: number;
  completed: number;
  current?: T;
};

type FileStat = {
  isDir: false;
  key: string;
  mtime: number;
  size: number;
  uid: string;
};
type FolderStat = { isDir: true; key: string };
type Stat = FileStat | FolderStat;
type StatsMap = Map<string, Stat>;

type RecordStat = { isDir: false; local: string; remote: string } | { isDir: true };
type RecordStatsMap = Map<string, RecordStat>;
```

In `FileStat`, `uid` is often Etag, MD5 hash or equivalent, whose equality means the file content is unchanged. `mtime` is Unix timestamp in milliseconds.

## `RootFs`

Every remote backend must implement this interface. Keys use a unified format: `/` for root, `note.md` / `folder/note.md` for files, `folder/` / `folder/nested/` for folders (trailing `/` required).

```ts
import type { RootFs } from '@hesprs/sync-engine-sdk';

type RootFs = {
  getUid(): string;
  read(key: string, stat: FileStat): MaybePromise<Binary>;
  readStream(key: string, stat: FileStat): MaybePromise<ReadableStream<Binary>>;
  write(key: string, value: Binary, stat: FileStat): MaybePromise<string>;
  writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat): MaybePromise<string>;
  delete(key: string): MaybePromise<void>;
  move(oldKey: string, newKey: string): MaybePromise<void>;
  mkdir(key: string, recursive?: boolean): MaybePromise<void>;
  stat(key: string): MaybePromise<Stat>;
  exists(key: string): MaybePromise<boolean>;
  list(key: string, reporter: ListReporter): MaybePromise<Array<Stat>>;
};
```

### `ListReporter`

The `list` method receives a reporter callback the backend must invoke during traversal. It receives a `Required<Progress>` (all fields present) and returns a `GlobMatchResult` controlling glob inclusion.

```ts
type ListReporter = (progress: Required<Progress>) => MaybePromise<GlobMatchResult>;
```

### Method Notes

- **`getUid()`** — Returns a stable unique identifier. Convention: `<type>~<distinguishing-data>~...` using `~` as delimiter. Example: `"webdav~https://example.com/dav~username"`.
- **`read` / `readStream`** — The `stat` parameter provides the file's `FileStat` so backends can implement conditional requests or range-based streaming. Keep average memory consumption during streaming around 16 MiB.
- **`write` / `writeStream`** — Returns a **uid** (ETag, MD5 hash, or equivalent) that uniquely identifies this version. `writeStream` should only resolve when the stream is fully consumed.
- **`delete`** — Should silently succeed if the key does not exist (idempotent).
- **`move`** — Implement as copy + delete if the backend doesn't support native move.
- **`mkdir`** — For backends with no real directories (like S3), create a zero-byte object. `recursive` creates parent directories first.
- **`stat`** — Throws if the key doesn't exist.
- **`list`** — Recursively lists all children. The `reporter` is required; call it during traversal with progress and trims return according to glob-match results:
  - `include`： include this file in the `list()` return, don't need to inspect descendants when the target is a folder
  - `exclude`: remove this item from your return.
  - `advance`: only appears on folders, means you not only need to include it, it is also required to recursively traverse the direct descendants of this folder.

### Class Implementation

```ts
import type { Progress, RootFs, Stat, Request } from '@hesprs/sync-engine-sdk';

export type MyFsOptions = {
  endpoint: string;
  apiKey: string;
};

export class MyFs implements RootFs {
  constructor(
    private readonly options: MyFsOptions,
    private readonly request: Request,
  ) {}

  getUid(): string {
    return `mybackend~${this.options.endpoint}~${this.options.apiKey}`;
  }

  // ... implement all methods, using this.request for network calls
}
```

Backends can implement methods beyond `RootFs` for special capabilities (e.g., S3 batch delete). Use `digOriginal` to access them from within wrappers or optimizers.

Examples: [Vault](https://github.com/hesprs/sync-engine/tree/main/packages/plugin/src/fs/vault), [WebDAV](https://github.com/hesprs/sync-engine/tree/main/packages/webdav/src/webdav/fs.ts).

## Wrapper Chain

Wrappers are middleware that wrap an `Fs` and return a `WrappedFs`. The chain is ordered numerically; lower `priority` values are applied first (innermost wrapper).

```ts
type WrappedFs = RootFs & { original: Fs };
type Fs = WrappedFs | RootFs;
```

For existing wrappers with priorities, and detailed behavior of each wrapper, see [deep dive: file system wrappers](../deep-dive/file-system-wrappers).

### `prefixWrapper`

Prefix wrapper is a runtime export for backends to support base-directory-like behavior easily. Behavior detail see [Prefix Wrapper](../deep-dive/file-system-wrappers#prefix-wrapper).

```ts
import { prefixWrapper } from '@hesprs/sync-engine-sdk';

const scopedFs = prefixWrapper(remoteFs, 'team/vault/');

await scopedFs.write('notes/today.md', value, stat);
// Delegates to remoteFs.write('team/vault/notes/today.md', value, stat)
```

### Registering a Wrapper

See [registration](./registration#filesystem-wrappers).

## Batch Optimization

The optimization wrapper (priority 2000) collects atomic FS operations and passes them to a `BatchOptimizer`. This allows backend-specific optimizations like S3 batch deletion or hierarchical operation reordering. For how the optimizer integrates with the wrapper chain, see [deep dive: file system wrappers](../deep-dive/file-system-wrappers#optimization-wrapper).

Sync Engine registers a default Hierarchical Optimizer at priority `10000` for both local and remote. This optimizer is designed to work in folder-file based file systems.

### Atom Types

```ts
type WriteAtom = {
  type: 'write';
  key: string;
  execute: () => MaybePromise<string>;
  resolve: (uid: string) => void;
  reject: (error: Error) => void;
};
type DeleteAtom = {
  type: 'delete';
  key: string;
  execute: () => MaybePromise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
};
type MoveAtom = {
  type: 'move';
  oldKey: string;
  newKey: string;
  execute: () => MaybePromise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
};
type MkdirAtom = {
  type: 'mkdir';
  key: string;
  execute: () => MaybePromise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
};
type InputAtom = WriteAtom | DeleteAtom | MoveAtom | MkdirAtom;

type CustomAtom = { type: 'custom'; execute: () => MaybePromise<void> };
type OutputAtom = InputAtom | CustomAtom;
type OptimizerOutput = Array<OutputAtom>;

type OptimizerInput = {
  atoms: Array<InputAtom>;
  fs: Fs;
  executeAtom: (atom: OutputAtom) => Promise<void | string>;
};
type BatchOptimizer = (input: OptimizerInput) => OptimizerOutput;
```

The optimizer receives the full atom list and can:

- Replace multiple atoms with a single `CustomAtom`
- Add or remove atoms
- Wrap an atom's `execute` by reassign it to await `executeAtom()` of dependency atoms
- Resolve or reject an atom directly

`executeAtom` invokes an atom's `execute()` from the parent reference and caches the result universally, so the atom is only executed once using the outermost wrapping.

When an atom succeeds, call `resolve()` with its UID for writes or without an argument for other operations. When it fails, call `reject(error)`. Rejection settles the original operation's promise and must propagate through custom atoms and any atoms removed by an optimizer.

::: warning

If the optimizer removes atoms from the input array, it **must** call `resolve()` or `reject(error)` on them (either directly or via custom atoms). Otherwise the original operation never settles.

:::

### Example: S3 Batch Delete Optimizer

```ts
import type { OptimizerInput, OptimizerOutput } from '@hesprs/sync-engine-sdk';
import { digOriginal } from '@hesprs/sync-engine-sdk';
import S3Fs, { BATCH_DELETE_MAX_KEYS } from './s3/fs';

export default function s3BatchDeleteOptimizer({
  atoms,
  fs,
}: OptimizerInput): OptimizerOutput | undefined {
  const original = digOriginal(fs);
  if (!(original instanceof S3Fs)) return undefined;
  const s3Fs = original;
  type DeleteAtom = Extract<(typeof atoms)[number], { type: 'delete' }>;
  const deleteAtoms = atoms.filter((a): a is DeleteAtom => a.type === 'delete');
  const otherAtoms = atoms.filter((a) => a.type !== 'delete');
  if (deleteAtoms.length === 0) return atoms;
  const batchGroups: Array<Array<DeleteAtom>> = [];
  for (let i = 0; i < deleteAtoms.length; i += BATCH_DELETE_MAX_KEYS)
    batchGroups.push(deleteAtoms.slice(i, i + BATCH_DELETE_MAX_KEYS));
  const batchAtoms = batchGroups.map((batch) => ({
    execute: async () => {
      const keys = batch.map((a) => a.key);
      try {
        const result = await s3Fs.batchDelete(keys);
        batch.forEach((atom) => {
          const status = result[atom.key];
          if (status === true) atom.resolve();
          else atom.reject(new Error(status ?? `S3 batch delete missing result for ${atom.key}.`));
        });
      } catch (error) {
        const reason = error instanceof Error ? error : new Error(String(error));
        batch.forEach((atom) => atom.reject(reason));
      }
    },
    type: 'custom' as const,
  }));
  return [...otherAtoms, ...batchAtoms];
}
```

More complex example: [Hierarchical Optimizer](https://github.com/hesprs/sync-engine/tree/main/packages/plugin/src/fs/hierarchical-optimizer.ts).

### Registering an Optimizer

See [registration](./registration#batch-optimizers).

## `digOriginal`

```ts
import { digOriginal } from '@hesprs/sync-engine-sdk';

function digOriginal(wrapped: Fs): RootFs;
```

Unwraps nested wrappers to the underlying root filesystem. Use when an optimizer needs to call backend-specific methods not on the `Fs` interface (e.g., `S3Fs.batchDelete()`), combined with `instanceof` check on the returned `RootFs`.
