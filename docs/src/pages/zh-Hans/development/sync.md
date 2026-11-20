# 同步

Sync Engine 的同步流水线在三个点上可扩展：同步触发器选项、决策和冲突解决。同步流水线的内部架构见[深入解析：同步](../deep-dive/sync)。

## 同步触发器

每次同步运行都由一个触发器名称和一组选项发起。`TriggerEntry` 以触发器名称注册，提供选项工厂；调度器冲刷一批同步请求时，会从这批触发器名称中选出优先级最高的条目，并把它的 `options()` 传给这次运行。

```ts
type TriggerEntry = { priority: number; options?: () => SyncOptions };
```

```ts
ctx.registerTrigger(key: string, entry: TriggerEntry): () => boolean;
```

`SyncOptions` 定制一次运行。未设置的字段回退到默认值：所选的冲突解决器、配置的策略规则、开启移动检测，以及不做任何确认。

```ts
type SyncOptions = {
  remoteLister?: RemoteLister;
  conflictResolver?: ConflictResolver;
  detectMoves?: boolean;
  needConfirmTasks?: boolean;
  needConfirmDeletion?: boolean;
  syncStrategy?: Array<GlobStrategy>;
};
```

`GlobStrategy` 是 `{ expr: string; strategy: string }`，其中 `strategy` 是已注册的决策器 ID 或 `none`。提供 `syncStrategy` 会替换这次运行的已配置规则；它不会与已有规则合并。

插件注册了内置条目：`realtime`（优先级 1000）、`interval`（2000）、`focus`（3000）、`startup`（4000）、`nonInteractiveManual`（4990）和 `manual`（5000）。以已有名称注册会替换该条目。

### 远端列表器

`SyncOptions.remoteLister` 提供远端文件列表，代替重新遍历。

```ts
type RemoteLister = (info: Infras & { reporter: ListReporter }) => MaybePromise<Array<Stat>>;
```

`Infras` 是 `{ localFs: Fs; remoteFs: Fs; record: RecordStore }`。`reporter` 必须透传给 `remoteFs.list()` 调用。触发器选项如何接入同步流程，见[深入解析：同步](../deep-dive/sync#sync-trigger)。

### 注册触发器条目

见[注册](./registration#sync-trigger)。

## 决策器

`Decider` 比较本地状态、远端状态和既有记录，为一种策略产出同步任务。

```ts
type DeciderInput = {
  localStats: StatsMap;
  remoteStats: StatsMap;
  records: RecordStatsMap;
  taskFactory: TaskFactory;
};

type Decider = (input: DeciderInput) => Array<Task>;
```

规划前，状态会按策略名称分桶；`decideTasks` 对每个有条目的桶调用一次已注册的决策器。每个提供 `prettyName` 的已注册决策器 ID 都会成为[同步策略](../usage/settings#同步策略)规则中的可选策略。请使用 `taskFactory` 而不是直接构造任务类，因为它们的构造函数需要内部同步基础设施。内置决策器包括 `bidirectional`、`mirrorLocal` 和 `mirrorRemote`，它们的行为见[深入解析：同步](../deep-dive/sync#decider)。

示例：[双向决策器](https://github.com/hesprs/sync-engine/blob/main/packages/plugin/src/sync/decision/bidirectional.ts)和[镜像决策器](https://github.com/hesprs/sync-engine/blob/main/packages/plugin/src/sync/decision/mirror.ts)。

### 注册决策器

见[注册](./registration#decider)。

## 冲突解决器

`ConflictResolver` 处理冲突的文件（自上次同步以来两侧都发生了变化）。

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
  await pipe({ from: remoteFs, to: localFs, key, stat: remote });
};
```

### 注册冲突解决器

见[注册](./registration#conflict-resolver)。

## 传输工具

`@hesprs/sync-engine-sdk` 导出的三个辅助函数，用于在文件系统之间复制文件内容，并按文件大小自动选择流式传输。

### `pipe`

```ts
import { pipe } from '@hesprs/sync-engine-sdk';

function pipe(options: { from: Fs; to: Fs; key: string; stat: FileStat }): MaybePromise<string>;
```

从 `from` 读取文件，以相同的 `key` 写入 `to`。读和写都会按文件大小选择缓冲或流式模式（自适应设备）。如果源文件不存在（TOCTOU 404 / `ENOENT`），辅助函数会抛出 `REGRET_ERROR`，其消息与 `REGRET_ERROR_MESSAGE` 导出一致；同步任务执行器把该错误视为任务完成，消失的源会跳过任务而不是失败。

```ts
await pipe({ from: remoteFs, to: localFs, key: 'folder/note.md', stat });
```

### `readWithSize`

```ts
function readWithSize(
  fs: Fs,
  key: string,
  stat: FileStat,
): Promise<Binary | ReadableStream<Binary>>;
```

读取文件，达到或超过流式阈值的文件用 `readStream`，否则用 `read`。阈值是 5 MiB，在低内存设备和 Android 上减半。文件不存在时抛出 `REGRET_ERROR`。`stat` 参数按接口要求转发给所选的 `Fs` 方法。

### `writeWithSize`

```ts
function writeWithSize(
  fs: Fs,
  key: string,
  value: MaybePromise<Binary | ReadableStream<Binary>>,
  stat: FileStat,
): MaybePromise<string>;
```

把值写入 `fs`，`stat.size` 达到或超过流式阈值时用 `writeStream`，否则用 `write`。值可以是 promise，底层写入调用会 await 它。返回底层写入调用的 uid。`stat` 参数按接口要求转发。

## 任务类型

所有任务类型都扩展 `BaseTask`，并且只导出类型。`TaskFactory` 接受任务专属的选项；每个任务都需要 `key`。

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

| 类型 | `key` 之外的必需选项 | 操作 |
| --- | --- | --- |
| `AddRecord` | `local: Stat`、`remote: Stat` | 为两侧创建记录。文件记录同时包含两个 UID；目录记录包含 `isDir`。 |
| `RemoveRecord` | 无 | 删除同步记录，不改任何一侧的文件系统。 |
| `Download` | `remote: FileStat` | 把远端文件复制到本地文件系统，并记录两个 UID。 |
| `Upload` | `local: FileStat` | 把本地文件复制到远端文件系统，并记录两个 UID。 |
| `CreateLocalDir` | `remote: FolderStat` | 创建本地目录及其同步记录。 |
| `CreateRemoteDir` | `local: FolderStat` | 创建远端目录及其同步记录。 |
| `RemoveLocal` | `local: Stat` | 删除本地路径及其同步记录。 |
| `RemoveRemote` | `remote: Stat` | 删除远端路径及其同步记录。 |
| `MoveLocal` | `newKey: string` | 把本地路径从 `key` 移动到 `newKey`，并移动它的记录。 |
| `MoveRemote` | `newKey: string` | 把远端路径从 `key` 移动到 `newKey`，并移动它的记录。 |
| `ResolveConflict` | `local: FileStat`、`remote: FileStat`、`resolver: ConflictResolver` | 携带两个文件状态和同步基础设施调用解决器。 |

## `SyncTerminateReason`

这是 `ctx.requestSync`、`ctx.executeSync` 的返回类型，也是 `syncTerminated` 事件的载荷类型。

```ts
type SyncTerminateReason =
  | { result: 'cancelled' }
  | { result: 'completed' }
  | { result: 'failed'; error: Error }
  | { result: 'noop' };
```
