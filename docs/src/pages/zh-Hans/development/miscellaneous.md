# 其他

## 导出索引

### 根运行时导出

| 导出 | 说明 |
| --- | --- |
| `digOriginal` | 解开嵌套包装器直到根文件系统。见[文件系统](./file-system#digoriginal)。 |
| `prefixWrapper` | 把一个带前缀的目录暴露为 `Fs` 根。见[文件系统](./file-system#prefixwrapper)。 |
| `setNeedMigration` | 给设置开关添加迁移确认行为；见[设置与界面](./settings-and-ui#感知迁移的开关)。 |
| `pipe` | 在两个文件系统之间传输文件，自动流式传输。见[同步](./sync#pipe)。 |
| `readWithSize` | 按大小阈值自动流式读取文件。见[同步](./sync#readwithsize)。 |
| `writeWithSize` | 按文件大小自动流式写入值。见[同步](./sync#writewithsize)。 |
| `REGRET_ERROR_MESSAGE` | `REGRET_ERROR` 的消息，这个哨兵错误表示一个操作被"反悔"而不是失败；同步任务执行器会把这类任务标记为完成而不是失败。见[同步](./sync#pipe)。 |
| `settingEntry` | 把父设置定义与嵌套设置定义组合起来。见[设置与界面](./settings-and-ui#嵌套设置注册)。 |
| `reactivelyValidate` | 给设置文本输入附加响应式校验。见[设置与界面](./settings-and-ui#响应式输入校验)。 |
| `generateEditableList` | 生成由临时草稿存储支持的可编辑列表设置定义。见[设置与界面](./settings-and-ui#可编辑列表)。 |

### `/dev` 运行时导出

| 导出           | 说明                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| `debugWrapper` | 记录调用的 FS 包装器。见[调试与测试](./debug-and-testing#debugwrapper)。  |
| `testKit`      | 测试工具集。见[调试与测试](./debug-and-testing#testkit)。                 |
| `sha256Text`   | SHA-256 哈希工具。见[分发](./distribution#用-sha256text-计算-integrity)。 |

### `/tsdown-plugin` 导出

| 导出 | 说明 |
| --- | --- |
| `syncEngineModule` | Tsdown 插件，桥接 `obsidian` 导入并把模块元数据嵌入为 magic bytes。见[编写一个模块](./develop-a-module#tsdown-插件)。 |

### 根类型导出

| 分组 | 导出 |
| --- | --- |
| Context | `Context`、`Settings`、`Events`、`Translations`、`SelectFromContext` |
| Events | `Dispatch`、`On` |
| 核心数据 | `Binary`、`MaybePromise`、`StringKV`、`Progress`、`FileStat`、`FolderStat`、`Stat`、`StatsMap`、`RecordStat`、`RecordStatsMap` |
| 文件系统 | `RootFs`、`WrappedFs`、`Fs`、`WriteAtom`、`DeleteAtom`、`MoveAtom`、`MkdirAtom`、`InputAtom`、`CustomAtom`、`OutputAtom`、`ListOptions`、`ListReporter`、`OptimizerInput`、`OptimizerOutput`、`BatchOptimizer` |
| 注册 | `FsWrapperEntry`、`RemoteFsEntry`、`RemoteRequestMiddlewareEntry`、`LocalRequestMiddlewareEntry`、`TriggerEntry`、`DeciderEntry`、`OptimizerEntry`、`SettingEntry`、`CallableOrObjectTree`、`LabelDefinition`、`ConflictResolverEntry`、`Request` |
| 同步 | `TaskNames`、`Task`、`AddRecord`、`RemoveRecord`、`Download`、`Upload`、`CreateLocalDir`、`CreateRemoteDir`、`RemoveLocal`、`RemoveRemote`、`MoveLocal`、`MoveRemote`、`ResolveConflict`、`TaskFactory`、`DeciderInput`、`Decider`、`SyncOptions`、`RemoteLister`、`ConflictResolver`、`ConflictResolverPayload`、`SyncTerminateReason` |
| 存储 | `RecordStore`、`StoreAsync`、`StoreSync`、`StoreOperations`、`DatabaseAsync`、`DatabaseSync` |
| 模块 | `ModuleMeta`、`AugmentedModuleMeta` |
| 请求 | `VaultRequest`、`RequestParam`、`RequestResponse`（`Request` 返回的响应类型） |
| 国际化 | `ObsidianLanguageCode`、`Fragment`、`Snippet`、`TranslationResource`、`Translate` |
| 其他 | `ExistingMemoryDB` |

内部辅助类型会出现在导出的签名中，但不是独立的根导出。它们包括 `TogglableValue`、`GlobStrategy`、`GlobMatchResult`、`Infras`、`BaseTaskOptions`、`GenericOptions`、`WithRemoteFileStat`、`WithLocalFileStat`、`WithRemoteFolderStat`、`WithLocalFolderStat`、`WithLocalStat`、`WithRemoteStat`、`WithBothStats`、`WithBothFileStats`、`WithNewKey`、`TaskOptionsMap`、`TaskInfo`、`FailedTaskInfo`、`DeleteConfirmReturn` 和 `CustomHeaders`。

## 设置

`Settings` 是 `ctx.settings` 处的合并对象。每个设置的说明见[用法：设置](../usage/settings)。

| 键 | 类型 |
| --- | --- |
| `moduleSources` | `Array<string>`，模块源 URL |
| `modules` | `Record<string, object>`，每个模块的设置 |
| `moduleAutoUpdate` | `boolean` |
| `remoteFs` | `string`，所选后端 ID |
| `syncStrategy` | `Array<GlobStrategy>`，有序策略规则 |
| `conflictResolver` | `string`，所选冲突解决器 ID |
| `maxFileSize` | `TogglableValue`，最大文件大小（字节） |
| `confirmTasksInSync` | `boolean` |
| `confirmDeleteInAutoSync` | `boolean` |
| `noticeStatusOnMobile` | `boolean` |
| `avoidAutoSyncWhenOffline` | `boolean` |
| `startupSync` | `TogglableValue`，延迟（毫秒） |
| `focusSync` | `TogglableValue`，焦点同步的最小间隔（毫秒） |
| `scheduledSync` | `TogglableValue`，间隔（毫秒） |
| `realtimeSync` | `TogglableValue`，防抖延迟（毫秒） |
| `maxRequestConcurrency` | `TogglableValue` |
| `minRequestInterval` | `TogglableValue`，间隔（毫秒） |
| `realtimeSyncFastMode` | `boolean` |
| `asymmetricStorage` | `boolean` |
| `customHeaders` | `Array<{ type: 'plaintext' \| 'secret'; value: string; key: string }>` |

`TogglableValue` 的形状是 `{ enabled: boolean; value: number }`。

## 其他 Context 成员

这些 Context 成员不常被模块使用。用法模式请阅读源码。

### 模块管理

| 成员 | 用途 |
| --- | --- |
| `discoveredModules` | 从发现的模块 ID 到 `AugmentedModuleMeta` 的 `Map`。 |
| `loadedModules` | 从已加载模块 ID 到模块构造器的 `Map`。 |
| `fetchSources(manual?)` | 从模块源获取模块元数据。`manual: true` 强制重新获取；`false` 使用内存缓存。 |
| `loadAllModules()` | 加载所有启用且已安装的模块。 |
| `loadModule(meta, start?)` | 加载指定模块；可选的第二个参数让它启动。 |
| `unloadModule(id)` | 卸载指定模块。 |
| `updateModules()` | 查找并下载可用的模块更新。 |
| `downloadModule(meta)` | 从 URL 下载单个模块。 |
| `installModule(meta, module)` | 从内存中的文件文本安装模块：写入、保存元数据，启用时加载。 |
| `deleteModule(id)` | 删除指定的已安装模块。 |
| `enableModule(id)` | 启用并加载模块。 |
| `disableModule(id)` | 卸载并禁用模块。 |
| `updateModuleMeta(meta)` | 更新已存储的模块元数据。 |
| `addSettingTab(plugin)` | 把 Sync Engine 设置页加到给定的 Obsidian 插件上。 |

### 文件系统与同步

| 成员 | 用途 |
| --- | --- |
| `createLocalFs()` | 创建包装后的本地文件系统。 |
| `createRemoteFs(id?)` | 创建所选的包装后远端文件系统。后端缺失时返回一个 `Error`。 |
| `getRequest()` | 获取组合好的远端请求函数。 |
| `getVaultRequest()` | 获取组合好的本地仓库请求函数。 |
| `getNamespace(local?, remote?)` | 为可选的本地 / 远端 FS 对创建存储命名空间。未设置后端时返回一个 `Error`。 |
| `initializeSync()` | 为同步创建本地 FS、远端 FS 和记录存储。 |
| `getCheckConnection()` | 获取所选后端的连接检查函数。 |
| `decideTasks(mapping, factory)` | 对映射中的每个策略桶调用已注册的决策器，返回任务计划。 |
| `getConflictResolver()` | 获取所选的 `ConflictResolver`。 |
| `optimizeLocal(input)` | 应用所选的本地 `BatchOptimizer`。 |
| `optimizeRemote(input)` | 应用所选的远端 `BatchOptimizer`。 |
| `reduceTriggers(triggers)` | 把触发器名称归约到最高优先级的条目。 |
| `executeSync(trigger, options?)` | 立即执行同步。 |
| `requestSync(trigger)` | 排队同步；以 `SyncTerminateReason` resolve。 |
| `remoteFsRegistry` | `Map<string, RemoteFsEntry>`。 |
| `deciderRegistry` | `Map<string, DeciderEntry>`。 |
| `conflictResolverRegistry` | `Map<string, ConflictResolverEntry>`。 |

### UI 与可观测性

| 成员                   | 用途                          |
| ---------------------- | ----------------------------- |
| `executionProgress`    | 任务执行的响应式 `Progress`。 |
| `walkProgress`         | 远端遍历的响应式 `Progress`。 |
| `syncStage`            | 响应式的当前同步阶段。        |
| `showProgress()`       | 打开进度界面。                |
| `hideProgress()`       | 隐藏进度界面。                |
| `getLogs()`            | 返回格式化的当前日志。        |
| `exportLogs()`         | 把日志导出到仓库文件。        |
| `startScheduledSync()` | 启动定时同步。                |
| `stopScheduledSync()`  | 停止定时同步。                |

### 核心与宿主

| 成员 | 用途 |
| --- | --- |
| `settings` | 合并后的 `Settings` 对象。 |
| `events` | 合并后的 `Events` 表。 |
| `i18n` | 合并后的 `Translations` 资源表。 |
| `app` | Obsidian `App` 实例。 |
| `manifest` | Sync Engine 自己的 Obsidian `PluginManifest`。 |
| `addCommand(cmd)` | 注册 Obsidian 命令并返回它。 |
| `removeCommand(command)` | 移除通过 `addCommand` 注册的命令。 |
| `registerEvent(ref)` | 注册 Obsidian `EventRef` 以便自动清理。 |
| `addRibbonIcon(...)` | 添加侧边栏图标并返回元素。 |
| `addStatusBarItem()` | 添加并返回状态栏元素。 |
| `registerObsidianProtocolHandler(action, handler)` | 注册 `obsidian://<action>` 处理器；返回注销函数。重复注册同一 action 会替换处理器。 |
| `registerView` / `registerHoverLinkSource` / `registerExtensions` / `registerMarkdownPostProcessor` / `registerMarkdownCodeBlockProcessor` / `registerBasesView` / `registerEditorExtension` / `registerEditorSuggest` / `registerCliHandler` / `registerDomEvent` | 与同名 Obsidian `Plugin` 方法一致。 |
| `saveSettings()` | 持久化当前 `settings`。 |
| `on(key, cb)` | 订阅带类型的 SDK 事件。见[事件](./events)。 |
| `dispatch(key, payload?)` | 发布带类型的 SDK 事件。见[事件](./events)。 |
| `isIdle` | 表示同步空闲状态的 SynthKernel `Ref<boolean>`。 |
| `translate` | 从合并的资源中翻译一个键。见[设置与界面](./settings-and-ui#国际化)。 |
| `rerenderSettingTab()` | 再次渲染贡献的设置。 |
| `refreshSettingTab()` | 低开销的设置页重渲染，让 Obsidian 重新评估每个设置条目的可见性。 |

### 框架成员

SynthKernel 的内部成员。模块代码通常不应调用它们。

| 成员            | 用途                       |
| --------------- | -------------------------- |
| `__modules__`   | 内部模块实例 `WeakMap`。   |
| `__getModule__` | 获取内部模块实例。         |
| `__addModule__` | 把模块构造器加入 context。 |
| `__assign__`    | 用合并的值扩展 context。   |
