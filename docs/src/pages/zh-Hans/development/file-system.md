# 文件系统

Sync Engine 在所有后端之上使用统一的文件系统接口。包装器作为中间件工作在这个接口之上。

## 核心数据类型

```ts
type Binary = Uint8Array<ArrayBuffer>;
type MaybePromise<T> = T | Promise<T>;
type StringKV = Record<string, string>;

type Progress<T = string> = { total: number; completed: number; current?: T };

type FileStat = {
  isDir: false;
  key: string;
  mtime: number;
  size: number;
  uid: string;
  // 元数据字段；对某些后端而言，获取元数据可能昂贵且缓慢
  meta: () => MaybePromise<StringKV>;
};
type FolderStat = { isDir: true; key: string; meta: () => MaybePromise<StringKV> };
type Stat = FileStat | FolderStat;
type StatsMap = Map<string, Stat>;

type RecordStat = { isDir: false; local: string; remote: string } | { isDir: true };
type RecordStatsMap = Map<string, RecordStat>;
```

在 `FileStat` 中，`uid` 通常是 Etag、MD5 哈希或等价物，相等即表示文件内容未变。`mtime` 是毫秒精度的 Unix 时间戳。`meta` 返回自定义元数据（例如创建时间）的字符串字典；该函数可能是异步的，因为有些后端需要额外一次请求来获取元数据。

## `RootFs`

每个远端后端必须实现这个接口。键使用统一格式：`/` 表示根目录，`note.md` / `folder/note.md` 表示文件，`folder/` / `folder/nested/` 表示文件夹（必须带尾部 `/`）。

```ts
import type { RootFs } from '@hesprs/sync-engine-sdk';

type RootFs = {
  getUid(): string;
  read(key: string, stat: FileStat): MaybePromise<Binary>;
  readStream(key: string, stat: FileStat): MaybePromise<ReadableStream<Binary>>;
  write(key: string, value: MaybePromise<Binary>, stat: FileStat): MaybePromise<string>;
  writeStream(
    key: string,
    value: MaybePromise<ReadableStream<Binary>>,
    stat: FileStat,
  ): MaybePromise<string>;
  delete(key: string): MaybePromise<void>;
  move(oldKey: string, newKey: string): MaybePromise<void>;
  mkdir(key: string, stat: FolderStat, recursive?: boolean): MaybePromise<void>;
  stat(key: string): MaybePromise<Stat>;
  exists(key: string): MaybePromise<boolean>;
  list(key: string, reporter: ListReporter): MaybePromise<Array<Stat>>;
};
```

### `ListReporter`

`list` 方法接收一个 reporter 回调，后端在遍历期间必须调用它。回调接收一个 `Required<Progress>`（所有字段齐全），并返回控制路径处理方式的 `ListOptions`。

```ts
type ListReporter = (progress: Required<Progress>) => MaybePromise<ListOptions>;
```

### 方法说明

- **`getUid()`**：返回稳定的唯一标识。约定格式为 `<type>~<distinguishing-data>~...`，用 `~` 作分隔符。例如 `"webdav~https://example.com/dav~username"`。
- **`read` / `readStream`**：`stat` 参数提供文件的 `FileStat`，后端可以借此实现条件请求或基于范围的流式传输。流式传输期间的平均内存占用保持在 16 MiB 左右。
- **`write` / `writeStream`**：返回唯一标识此版本的 **uid**（ETag、MD5 哈希或等价物）。`value` 可能是 promise，写入前先 await。`writeStream` 只有在流被完整消费后才应 resolve。
- **`delete`**：键不存在时应静默成功（幂等）。
- **`move`**：后端不支持原生移动时，用复制 + 删除实现。
- **`mkdir`**：对没有真实目录的后端（例如 S3），创建一个零字节对象。`recursive` 会先创建父目录。
- **`stat`**：键不存在时抛出异常。
- **`list`**：递归列出所有子项。`reporter` 必须调用；遍历期间带着进度调用它，并按其返回值修剪结果：
  - `include`：把这一项纳入 `list()` 的返回；目标是文件夹时无需再检查其后代。
  - `exclude`：把这一项从返回中移除。
  - `advance`：只出现在文件夹上。包含该文件夹，并递归遍历其直接后代。

### 类实现

```ts
import type { Progress, Request, RootFs, Stat } from '@hesprs/sync-engine-sdk';

export type MyFsOptions = { endpoint: string; apiKey: string };

export class MyFs implements RootFs {
  constructor(
    private readonly options: MyFsOptions,
    private readonly request: Request,
  ) {}

  getUid(): string {
    return `mybackend~${this.options.endpoint}~${this.options.apiKey}`;
  }

  // ... 实现所有方法，网络调用使用 this.request
}
```

后端可以实现 `RootFs` 之外的方法来提供特殊能力（例如 S3 批量删除）。包装器或优化器内部用 `digOriginal` 访问它们。

示例：[Vault](https://github.com/hesprs/sync-engine/tree/main/packages/plugin/src/fs/vault)、[WebDAV](https://github.com/hesprs/sync-engine/tree/main/packages/webdav/src/webdav/fs.ts)。

## 包装器链

包装器是包住一个 `Fs` 并返回 `WrappedFs` 的中间件。链按数值排序，`priority` 值越小越先应用（最内层包装器）。

```ts
type WrappedFs = RootFs & { original: Fs };
type Fs = WrappedFs | RootFs;
```

现有包装器的优先级和每个包装器的详细行为，见[深入解析：文件系统包装器](../deep-dive/file-system-wrappers)。

### `prefixWrapper`

前缀包装器是一个运行时导出，让后端轻松支持类似基目录的行为。行为细节见[前缀包装器](../deep-dive/file-system-wrappers#prefix-wrapper)。

```ts
import { prefixWrapper } from '@hesprs/sync-engine-sdk';

const scopedFs = prefixWrapper(remoteFs, 'team/vault/');

await scopedFs.write('notes/today.md', value, stat);
// Delegates to remoteFs.write('team/vault/notes/today.md', value, stat)
```

### 注册包装器

见[注册](./registration#filesystem-wrappers)。

## 批量优化

优化包装器（优先级 2000）收集原子 FS 操作并交给 `BatchOptimizer`。这样后端可以做专门的优化，例如 S3 批量删除或层级操作重排。优化器如何与包装器链整合，见[深入解析：文件系统包装器](../deep-dive/file-system-wrappers#optimization-wrapper)。

Sync Engine 在优先级 `10000` 为本地和远端注册了默认的层级优化器。这个优化器为基于文件夹-文件的文件系统设计。

### 原子类型

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

优化器接收完整的原子列表，并且可以：

- 把多个原子替换为单个 `CustomAtom`
- 增加或移除原子
- 通过把某个原子的 `execute` 重新赋值为等待依赖原子的 `executeAtom()` 来包装它
- 直接 resolve 或 reject 一个原子

`executeAtom` 从父引用调用原子的 `execute()`，并全局缓存结果，因此原子只会以最外层包装执行一次。

原子成功时，写操作用它的 UID 调用 `resolve()`，其他操作不带参数调用。失败时调用 `reject(error)`。rejection 会 settle 原始操作的 promise，并且必须穿透自定义原子和被优化器移除的原子传播出去。

::: warning

优化器从输入数组中移除原子时，**必须**对它们调用 `resolve()` 或 `reject(error)`（直接调用或经由自定义原子）。否则原始操作永远不会 settle。

:::

### 示例：S3 批量删除优化器

```ts
import S3Fs from './s3/fs';
import { digOriginal } from '@hesprs/sync-engine-sdk';
import type { DeleteAtom, OptimizerInput, OptimizerOutput } from '@hesprs/sync-engine-sdk';

export default function s3BatchDeleteOptimizer({
  atoms,
  fs,
}: OptimizerInput): OptimizerOutput | undefined {
  const original = digOriginal(fs);
  if (!(original instanceof S3Fs)) return;
  const deleteAtoms = atoms.filter((a): a is DeleteAtom => a.type === 'delete');
  if (deleteAtoms.length <= 1) return atoms;
  const otherAtoms = atoms.filter((a) => a.type !== 'delete');
  const batchAtom = {
    execute: async () => {
      const keys = deleteAtoms.map((a) => a.key);
      try {
        const result = await original.batchDelete(keys);
        deleteAtoms.forEach((atom) => {
          const status = result[atom.key];
          if (status) atom.reject(status);
          else atom.resolve();
        });
      } catch (error) {
        const reason = error instanceof Error ? error : new Error(String(error));
        deleteAtoms.forEach((atom) => atom.reject(reason));
      }
    },
    type: 'custom' as const,
  };
  return [...otherAtoms, batchAtom];
}
```

`S3Fs.batchDelete()` 自身会把键拆成最多 1000 个键的 `DeleteObjects` 请求，resolve 为一个只包含失败键的记录，每个键映射到它的 `Error`。

更复杂的示例：[层级优化器](https://github.com/hesprs/sync-engine/tree/main/packages/plugin/src/fs/hierarchical-optimizer.ts)。

### 注册优化器

见[注册](./registration#batch-optimizers)。

## `digOriginal`

```ts
import { digOriginal } from '@hesprs/sync-engine-sdk';

function digOriginal(wrapped: Fs): RootFs;
```

层层解开嵌套的包装器，得到底层的根文件系统。优化器需要调用 `Fs` 接口上没有的后端专属方法（例如 `S3Fs.batchDelete()`）时使用，配合对返回的 `RootFs` 的 `instanceof` 检查。
