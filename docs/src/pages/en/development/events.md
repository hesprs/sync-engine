# Events

Sync Engine uses a typed event system. `Context` provides `on` for subscribing and `dispatch` for publishing.

## `On` and `Dispatch`

```ts
type On<O extends object> = <K extends keyof O>(
  key: K,
  callback: (payload: O[K]) => void,
) => () => void;

type Dispatch<O extends object> = <K extends keyof O>(
  ...[key, payload]: undefined extends O[K] ? [K] : [K, O[K]]
) => void;
```

`on` returns a cleanup callback. `dispatch` makes payloadless events (type `undefined`) optional — call `ctx.dispatch('syncCanceled')` without a second argument.

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

`On<O>` and `Dispatch<O>` are generic function types that allow custom event maps. In ordinary module code, use `ctx.on<Events>` and `ctx.dispatch<Events>`; type inference supplies valid event keys and payloads.

## `Events` Map

`Events` is a merged event map contributed by all internal modules. Every event key and its payload type:

| Event                  | Payload                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `logSync`              | `string` sync log message                                                                                            |
| `logGeneral`           | `string` general log message                                                                                         |
| `errorSync`            | `string` sync error log message                                                                                      |
| `errorGeneral`         | `string` general error log message                                                                                   |
| `moduleLoaded`         | `string` module name                                                                                                 |
| `moduleUnloaded`       | `string` module name                                                                                                 |
| `syncStarted`          | `{ isCancelled: Ref<boolean>; trigger: string }`                                                                     |
| `syncInitialized`      | `Infras & { match: (path: string) => GlobMatchResult }` — the run's file systems, record store, and compiled matcher |
| `remoteWalkProgress`   | `Progress`                                                                                                           |
| `syncTerminated`       | `SyncTerminateReason`                                                                                                |
| `requestConfirmDelete` | `Array<RemoveLocal>` pending local-remove tasks                                                                      |
| `requestConfirmTasks`  | `Array<BaseTask>`                                                                                                    |
| `syncCanceled`         | `undefined` (no payload)                                                                                             |
| `taskCompleted`        | `TaskInfo` (`{ name: TaskNames; key: string; prettyName: string; isDir: boolean }`)                                  |
| `taskFailed`           | `FailedTaskInfo` (`TaskInfo` & `{ error: string }`)                                                                  |
| `executionStarted`     | `Array<BaseTask>`                                                                                                    |
| `tasksConfirmed`       | `Array<BaseTask>`                                                                                                    |
| `deleteConfirmed`      | `{ delete: Array<RemoveLocal>; reupload: Array<RemoveLocal> }`                                                       |

::: tip

`syncStarted.isCancelled` is a SynthKernel `Ref<boolean>` — call it as `isCancelled()` to read, or subscribe with `isCancelled.subscribe(...)`.

:::

## Sync Lifecycle Events

`syncStarted` fires before the file-system stacks exist; `syncInitialized` fires once per run after infrastructure initialization and before traversal, and is the only point where the sync's actual `localFs`, `remoteFs`, and `record` are published. Its `Infras` shape is `{ localFs: Fs; remoteFs: Fs; record: RecordStore }`, documented with the [remote lister](./sync#remote-lister); `match` is the compiled [inclusion/exclusion matcher](../usage/settings#inclusion-and-exclusion-rules).
