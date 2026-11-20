# 事件

Sync Engine 使用带类型的事件系统。`Context` 提供订阅用的 `on` 和发布用的 `dispatch`。

## `On` 与 `Dispatch`

```ts
type On<O extends object> = <K extends keyof O>(
  key: K,
  callback: (payload: O[K]) => void,
) => () => void;

type Dispatch<O extends object> = <K extends keyof O>(
  ...[key, payload]: undefined extends O[K] ? [K] : [K, O[K]]
) => void;
```

`on` 返回清理回调。`dispatch` 让无载荷事件（类型为 `undefined`）可以省略参数：不带第二个参数调用 `ctx.dispatch('syncCanceled')` 即可。

```ts
import type { Events, On, Dispatch } from '@hesprs/sync-engine-sdk';

const on: On<Events> = ctx.on;
const on: Dispatch<Events> = ctx.dispatch;

const unsubscribe = on('syncTerminated', (reason) => {
  if (reason.result === 'failed') console.error(reason.error);
});

dispatch('logGeneral', 'Example module started.');
dispatch('syncCanceled');

unsubscribe();
```

`On<O>` 和 `Dispatch<O>` 是泛型函数类型，允许自定义事件表。在普通模块代码中，使用 `ctx.on<Events>` 和 `ctx.dispatch<Events>`；类型推断会给出有效的事件键和载荷。

## `Events` 表

`Events` 是由所有内部模块贡献的合并事件表。每个事件键及其载荷类型：

| 事件 | 载荷 |
| --- | --- |
| `logSync` | `string` 同步日志消息 |
| `logGeneral` | `string` 一般日志消息 |
| `errorSync` | `Error` 同步错误 |
| `errorGeneral` | `Error` 一般错误 |
| `moduleLoaded` | `AugmentedModuleMeta` 模块元数据 |
| `moduleUnloaded` | `string` 模块名称 |
| `syncStarted` | `{ isCancelled: Ref<boolean>; trigger: string }` |
| `syncInitialized` | `Infras & { match: (path: string) => GlobMatchResult }`：本次运行的文件系统、记录存储和编译好的匹配器 |
| `remoteWalkProgress` | `Progress` |
| `syncTerminated` | `SyncTerminateReason` |
| `requestConfirmDelete` | `Array<RemoveLocal>` 待确认的本地删除任务 |
| `requestConfirmTasks` | `Array<Task>` |
| `syncCanceled` | `undefined`（无载荷） |
| `taskCompleted` | `TaskInfo`（`{ name: TaskNames; key: string; prettyName: string; isDir: boolean }`） |
| `taskFailed` | `FailedTaskInfo`（`TaskInfo` & `{ error: Error }`） |
| `executionStarted` | `Array<Task>` |
| `tasksConfirmed` | `Array<Task>` |
| `deleteConfirmed` | `{ delete: Array<RemoveLocal>; reupload: Array<RemoveLocal> }` |

::: tip

`syncStarted.isCancelled` 是 SynthKernel 的 `Ref<boolean>`：像 `isCancelled()` 这样调用即可读取，或用 `isCancelled.subscribe(...)` 订阅。

:::

## 同步生命周期事件

`syncStarted` 在文件系统栈存在之前触发；`syncInitialized` 在每次运行的基础设施初始化之后、遍历之前触发一次，是发布同步实际的 `localFs`、`remoteFs` 和 `record` 的唯一位置。它的 `Infras` 形状是 `{ localFs: Fs; remoteFs: Fs; record: RecordStore }`，与[远端列表器](./sync#远端列表器)一起记录在案；`match` 是编译好的[同步策略匹配器](../usage/settings#同步策略规则)。
