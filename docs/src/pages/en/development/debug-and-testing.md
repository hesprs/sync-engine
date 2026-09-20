# Debug and Testing

## `testKit`

Test harness utilities for writing FS and request tests. Import from `@hesprs/sync-engine-sdk/dev`.

```ts
import { testKit } from '@hesprs/sync-engine-sdk/dev';

const { fs, bytes } = testKit;
const harness = fs();
const content = bytes('hello');
```

### Types

```ts
type FsCalls = {
  delete: Array<string>;
  exists: Array<string>;
  list: Array<string>;
  mkdir: Array<string>;
  move: Array<[string, string]>;
  read: Array<[string, FileStat]>;
  readStream: Array<[string, FileStat]>;
  stat: Array<string>;
  write: Array<[string, Binary, FileStat]>;
  writeStream: Array<[string, FileStat]>;
};

type FsOptions = {
  control?: Partial<Fs>;
  uid?: string;
};

type FsHarness = {
  calls: FsCalls;
  control: Fs;
  fs: RootFs;
};

type RequestHarness = {
  calls: Array<RequestParam & { url: string }>;
  request: Request;
};
```

### API

```ts
const testKit: {
  bytes: (value: string) => Binary;
  deferred: <T>() => {
    promise: Promise<T>;
    reject: (reason?: unknown) => void;
    resolve: (value: T | PromiseLike<T>) => void;
  };
  file: (key: string, options?: { mtime?: number; size?: number; uid?: string }) => FileStat;
  folder: (key: string) => FolderStat;
  flush: (turns?: number) => Promise<void>;
  fs: (options?: FsOptions) => FsHarness;
  request: (
    control: (url: string, params: RequestParam) => MaybePromise<Partial<RequestResponse>>,
  ) => RequestHarness;
  stream: (chunks?: Array<Binary | string>) => ReadableStream<Binary>;
};
```

| Helper                | Description                                                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bytes(value)`        | Convert a string to `Binary`.                                                                                                                                                           |
| `deferred()`          | Create a controlled promise.                                                                                                                                                            |
| `file(key, options?)` | Create a `FileStat`.                                                                                                                                                                    |
| `folder(key)`         | Create a `FolderStat`.                                                                                                                                                                  |
| `flush(turns?)`       | Wait for several microtask queues to finish (default 4).                                                                                                                                |
| `fs(options?)`        | Create a stub filesystem. `control` overrides individual methods; `uid` sets `getUid()`.                                                                                                |
| `request(control)`    | Wrap a response control to record calls. The control receives the same arguments as `Request` and returns response overrides; each recorded call is the url merged into its parameters. |
| `stream(chunks?)`     | Create a fake `ReadableStream` from an array.                                                                                                                                           |

### `fs()` Details

The `control` field accepts `Partial<Fs>` — any method not overridden gets a default implementation. The returned `fs` is a `RootFs` that records all calls into `calls` and delegates to `control`. Method signatures match `RootFs` exactly, including the `stat: FileStat` parameter on `read`/`readStream`/`write`/`writeStream` and the `reporter: ListReporter` parameter on `list`.

## `debugWrapper`

An `FsWrapper` that logs every method call. Useful during debugging.

```ts
function debugWrapper(original: Fs, log: (content: string) => void): WrappedFs;
```

```ts
import { debugWrapper } from '@hesprs/sync-engine-sdk/dev';

ctx.registerRemoteFsWrapper({
  priority: 9999,
  apply: (fs) => debugWrapper(fs, console.log),
});
```

## `SelectFromContext`

`SelectFromContext<O>` is a utility type that extracts a subset of `Context` for integration testing. If `Context` extends `O`, it resolves to `O`; otherwise `never`. This lets you construct a minimal plain object satisfying the subset your module actually uses for integration testing, without mocking the full SynthKernel.

```ts
import type { SelectFromContext } from '@hesprs/sync-engine-sdk';

type MyModuleContext = SelectFromContext<{
  settings: Settings;
  registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => boolean;
}>;

// Construct a test context as a plain object
const testCtx: MyModuleContext = {
  settings: {/* ... */},
  registerRemoteFsWrapper: () => () => true,
};
```
