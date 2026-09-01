# Miscellaneous

## Export Index

### Root runtime exports

| Export                 | Description                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `digOriginal`          | Unwraps nested wrappers to root filesystem. See [file system](./file-system#digoriginal).                                                   |
| `prefixWrapper`        | Exposes a prefixed directory as an `Fs` root. See [file system](./file-system#prefixwrapper).                                               |
| `setNeedMigration`     | Adds migration confirmation behavior to a setting toggle; see [Settings and UI](./settings-and-ui#migration-aware-toggles).                 |
| `pipe`                 | Transfer a file between two filesystems with auto-streaming. See [file system](./file-system#pipe).                                         |
| `readWithSize`         | Read a file with auto-streaming by size threshold. See [file system](./file-system#readwithsize).                                           |
| `writeWithValue`       | Write a value with auto-streaming by input type. See [file system](./file-system#writewithvalue).                                           |
| `s`                    | Combines a parent setting definition with nested setting definitions. See [Settings and UI](./settings-and-ui#nested-setting-registration). |
| `reactivelyValidate`   | Attaches reactive validation to a setting text input. See [Settings and UI](./settings-and-ui#reactive-input-validation).                   |
| `generateEditableList` | Generates an editable list setting definition backed by an ephemeral draft store. See [Settings and UI](./settings-and-ui#editable-lists).  |

### `/dev` runtime exports

| Export             | Description                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `debugWrapper`     | FS wrapper that logs calls. See [debug and testing](./debug-and-testing#debugwrapper).                                                            |
| `testKit`          | Test harness utilities. See [debug and testing](./debug-and-testing#testkit).                                                                     |
| `syncEngineModule` | Tsdown plugin bridging `obsidian` imports and embedding module metadata as magic bytes. See [writing a module](./develop-a-module#tsdown-plugin). |
| `sha256`           | SHA-256 hash utility. See [distribution](./distribution#computing-integrity-with-sha256).                                                         |

### Root type exports

| Group                | Exports                                                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Context              | `Context`, `Settings`, `Events`, `Translations`, `SelectFromContext`                                                                                                                                                                                                                                         |
| Events               | `Dispatch`, `On`                                                                                                                                                                                                                                                                                             |
| Core data            | `Binary`, `MaybePromise`, `Progress`, `FileStat`, `FolderStat`, `Stat`, `StatsMap`, `RecordStat`, `RecordStatsMap`                                                                                                                                                                                           |
| Filesystem           | `RootFs`, `WrappedFs`, `Fs`, `WriteAtom`, `DeleteAtom`, `MoveAtom`, `MkdirAtom`, `InputAtom`, `CustomAtom`, `OutputAtom`, `OptimizerInput`, `OptimizerOutput`, `BatchOptimizer`                                                                                                                              |
| Registration         | `FsWrapperEntry`, `RemoteFsEntry`, `RemoteRequestMiddlewareEntry`, `LocalRequestMiddlewareEntry`, `RemoteLister`, `RemoteListerEntry`, `DeciderEntry`, `OptimizerEntry`, `SettingEntry`, `CallableOrObjectTree`, `LabelDefinition`, `ConflictResolverEntry`, `Request`, `CheckConnectionResult`              |
| Sync                 | `TaskNames`, `BaseTask`, `AddRecord`, `RemoveRecord`, `Download`, `Upload`, `CreateLocalDir`, `CreateRemoteDir`, `RemoveLocal`, `RemoveRemote`, `MoveLocal`, `MoveRemote`, `ResolveConflict`, `TaskFactory`, `DeciderInput`, `Decider`, `ConflictResolver`, `ConflictResolverPayload`, `SyncTerminateReason` |
| Storage              | `RecordStore`, `StoreAsync`, `StoreSync`, `StoreOperations`, `DatabaseAsync`, `DatabaseSync`                                                                                                                                                                                                                 |
| Modules              | `ModuleMeta`, `AugmentedModuleMeta`                                                                                                                                                                                                                                                                          |
| Request              | `VaultRequest`, `RequestParam`, `RequestResponse` (the response type returned by `Request`)                                                                                                                                                                                                                  |
| Internationalization | `ObsidianLanguageCode`, `Fragment`, `TranslationResource`, `Translate`                                                                                                                                                                                                                                       |
| Other                | `ExistingMemoryDB`                                                                                                                                                                                                                                                                                           |

Internal supporting types can appear in exported signatures but are not standalone root exports. They include `TogglableValue`, `GlobMatchRule`, `Infras`, `BaseTaskOptions`, `TaskOptions`, `TaskOptionsMap`, `TaskInfo`, `FailedTaskInfo`, `DeleteConfirmReturn`, `CustomHeaders`, and `InterpolationValues`.

## Settings

`Settings` is a merged object at `ctx.settings`. For descriptions of each setting, see [usage: settings](../usage/settings).

| Key                       | Type                                                                   |
| ------------------------- | ---------------------------------------------------------------------- |
| `moduleSources`           | `Array<string>` of registry URLs                                       |
| `modules`                 | `Record<string, object>` of per-module settings                        |
| `moduleAutoUpdate`        | `boolean`                                                              |
| `remoteFs`                | `string` selected backend ID                                           |
| `decider`                 | `string` selected decider ID                                           |
| `conflictResolver`        | `string` selected conflict-resolver ID                                 |
| `maxFileSize`             | `TogglableValue` max file size in bytes                                |
| `confirmTasksInSync`      | `boolean`                                                              |
| `confirmDeleteInAutoSync` | `boolean`                                                              |
| `noticeStatusOnMobile`    | `boolean`                                                              |
| `startupSync`             | `TogglableValue` delay in milliseconds                                 |
| `scheduledSync`           | `TogglableValue` interval in milliseconds                              |
| `realtimeSync`            | `TogglableValue` debounce delay in milliseconds                        |
| `inclusionRules`          | `Array<GlobMatchRule>`                                                 |
| `exclusionRules`          | `Array<GlobMatchRule>`                                                 |
| `maxMemoryConsumption`    | `TogglableValue` in bytes                                              |
| `maxRequestConcurrency`   | `TogglableValue`                                                       |
| `minRequestInterval`      | `TogglableValue` in milliseconds                                       |
| `realtimeSyncFastMode`    | `boolean`                                                              |
| `asymmetricStorage`       | `boolean`                                                              |
| `customHeaders`           | `Array<{ type: 'plaintext' \| 'secret'; value: string; key: string }>` |

`TogglableValue` has shape `{ enabled: boolean; value: number }`.

## Other Context Members

These Context members are not commonly used by modules. Explore source code to obtain usage patterns.

### Module Management

| Member                        | Purpose                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `discoveredModules`           | `Map` from discovered module ID to `AugmentedModuleMeta`.                                          |
| `loadedModules`               | `Map` from loaded module ID to module constructor.                                                 |
| `fetchSources(manual?)`       | Fetches module metadata from sources. `manual: true` forces refetch; `false` uses in-memory cache. |
| `loadAllModules()`            | Loads all enabled installed modules.                                                               |
| `loadModule(meta, start?)`    | Loads named module; optional second argument starts it.                                            |
| `unloadModule(id)`            | Unloads named module.                                                                              |
| `updateModules()`             | Finds and downloads available module updates.                                                      |
| `downloadModule(meta)`        | Downloads one module from URL.                                                                     |
| `installModule(meta, module)` | Installs module from in-memory file text: writes, stores metadata, loads when enabled.             |
| `deleteModule(id)`            | Deletes named installed module.                                                                    |
| `enableModule(id)`            | Enables and loads a module.                                                                        |
| `disableModule(id)`           | Unloads and disables a module.                                                                     |
| `updateModuleMeta(meta)`      | Updates stored module metadata.                                                                    |
| `addSettingTab(plugin)`       | Adds Sync Engine setting tab to supplied Obsidian plugin.                                          |

### Filesystem and Sync

| Member                          | Purpose                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `createLocalFs()`               | Creates wrapped local filesystem.                            |
| `createRemoteFs(id?)`           | Creates selected wrapped remote filesystem.                  |
| `getRequest()`                  | Gets composed remote request function.                       |
| `getVaultRequest()`             | Gets composed local vault request function.                  |
| `getNamespace(local?, remote?)` | Creates storage namespace for optional local/remote FS pair. |
| `initializeSync()`              | Creates local FS, remote FS, and record store for sync.      |
| `getCheckConnection()`          | Gets selected backend connection-check function.             |
| `getDecider()`                  | Gets selected `Decider`.                                     |
| `getConflictResolver()`         | Gets selected `ConflictResolver`.                            |
| `optimizeLocal(input)`          | Applies selected local `BatchOptimizer`.                     |
| `optimizeRemote(input)`         | Applies selected remote `BatchOptimizer`.                    |
| `listRemote(info)`              | Lists remote entries for a sync trigger.                     |
| `executeSync(tasks)`            | Executes synchronization immediately.                        |
| `requestSync(trigger)`          | Queues sync; resolves with `SyncTerminateReason`.            |
| `remoteFsRegistry`              | `Map<string, RemoteFsEntry>`.                                |
| `deciderRegistry`               | `Map<string, DeciderEntry>`.                                 |
| `conflictResolverRegistry`      | `Map<string, ConflictResolverEntry>`.                        |

### UI and Observability

| Member                 | Purpose                                   |
| ---------------------- | ----------------------------------------- |
| `executionProgress`    | Reactive `Progress` for task execution.   |
| `walkProgress`         | Reactive `Progress` for remote traversal. |
| `syncStage`            | Reactive current sync stage.              |
| `showProgress()`       | Opens progress UI.                        |
| `hideProgress()`       | Hides progress UI.                        |
| `getLogs()`            | Returns formatted current logs.           |
| `exportLogs()`         | Exports logs to vault file.               |
| `startScheduledSync()` | Starts interval sync.                     |
| `stopScheduledSync()`  | Stops interval sync.                      |

### Core and Host

| Member                    | Purpose                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `settings`                | Merged `Settings` object.                                                                              |
| `events`                  | Merged `Events` map.                                                                                   |
| `i18n`                    | Merged `Translations` resource map.                                                                    |
| `app`                     | Obsidian `App` instance.                                                                               |
| `addCommand(cmd)`         | Registers Obsidian command and returns it.                                                             |
| `registerEvent(ref)`      | Registers Obsidian `EventRef` for automatic cleanup.                                                   |
| `addRibbonIcon(...)`      | Adds ribbon icon and returns element.                                                                  |
| `addStatusBarItem()`      | Adds and returns status-bar element.                                                                   |
| `saveSettings()`          | Persists current `settings`.                                                                           |
| `on(key, cb)`             | Subscribes to typed SDK event. See [events](./events).                                                 |
| `dispatch(key, payload?)` | Dispatches typed SDK event. See [events](./events).                                                    |
| `isIdle`                  | SynthKernel `Ref<boolean>` for sync-idle state.                                                        |
| `translate`               | Translates a key from merged resources. See [Settings and UI](./settings-and-ui#internationalization). |
| `rerenderSettingTab()`    | Renders contributed settings again.                                                                    |
| `refreshSettingTab()`     | Cheap setting page rerender that makes Obsidian reevaluate the visibility of each setting entry.       |

### Framework Members

SynthKernel internal members. Module code normally should not call them.

| Member          | Purpose                             |
| --------------- | ----------------------------------- |
| `__modules__`   | Internal module-instance `WeakMap`. |
| `__getModule__` | Gets internal module instance.      |
| `__addModule__` | Adds module constructor to context. |
| `__assign__`    | Extends context with merged values. |
