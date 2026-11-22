# 调试与测试

## `testKit`

编写 FS 和请求测试的测试工具集。从 `@hesprs/sync-engine-sdk/dev` 导入。

```ts
import { testKit } from '@hesprs/sync-engine-sdk/dev';

const { fs, bytes } = testKit;
const harness = fs();
const content = bytes('hello');
```

### 类型

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

type FsOptions = { control?: Partial<Fs>; uid?: string };

type FsHarness = { calls: FsCalls; control: Fs; fs: RootFs };

type RequestHarness = { calls: Array<RequestParam & { url: string }>; request: Request };
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

| 辅助函数 | 说明 |
| --- | --- |
| `bytes(value)` | 把字符串转换为 `Binary`。 |
| `deferred()` | 创建一个可控的 promise。 |
| `file(key, options?)` | 创建一个 `FileStat`。 |
| `folder(key)` | 创建一个 `FolderStat`。 |
| `flush(turns?)` | 等待若干轮微任务队列结束（默认 4）。 |
| `fs(options?)` | 创建一个桩文件系统。`control` 覆盖单个方法；`uid` 设置 `getUid()`。 |
| `request(control)` | 包装一个响应控制器来记录调用。控制器接收与 `Request` 相同的参数并返回响应覆盖值。 |
| `stream(chunks?)` | 从数组创建一个假的 `ReadableStream`。 |

### `fs()` 细节

`control` 字段接受 `Partial<Fs>`：未被覆盖的方法使用默认实现。返回的 `fs` 是一个 `RootFs`，把所有调用记录到 `calls` 并委托给 `control`。方法签名与 `RootFs` 完全一致，包括 `read`/`readStream`/`write`/`writeStream` 上的 `stat: FileStat` 参数和 `list` 上的 `reporter: ListReporter` 参数。

## `debugWrapper`

一个记录每次方法调用的 `FsWrapper`。调试时有用。

```ts
function debugWrapper(original: Fs, log: (content: string) => void): WrappedFs;
```

```ts
import { debugWrapper } from '@hesprs/sync-engine-sdk/dev';

ctx.registerRemoteFsWrapper({ priority: 9999, apply: (fs) => debugWrapper(fs, console.log) });
```

## `SelectFromContext`

`SelectFromContext<O>` 是一个工具类型，从 `Context` 中提取子集用于集成测试。如果 `Context` extends `O`，它解析为 `O`；否则为 `never`。这让你可以为集成测试构造一个满足模块实际使用的子集的最小普通对象，而不用 mock 整个 SynthKernel。

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
