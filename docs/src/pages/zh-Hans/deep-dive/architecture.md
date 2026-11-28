# Sync Engine 架构

Sync Engine 由一组有序的内部模块组成。插件入口把这些模块交给 [SynthKernel](https://github.com/hesprs/synthkernel)，一个小的依赖注入与响应式运行时。结果是核心、UI 和动态加载的模块共享一个带类型的 context。

架构有三个边界：

- **内核边界**：SynthKernel 构造模块、注入依赖，并把它们的公开 API 合并进一个 context。
- **能力边界**：Registrar 为文件系统、请求、同步决策、设置和其他扩展点暴露带类型的工厂和注册表。
- **执行边界**：同步作用于抽象的本地和远端文件系统。平台细节通过 `VaultRequest`、`Request`、中间件和文件系统包装器进入。

[核心同步流程](./sync)、[请求抽象](./request)和[文件系统包装器](./file-system-wrappers)详细规定了这些执行边界。

## 运行时生命周期

`SyncEngine.onload()` 按以下顺序执行：

1. 加载设置。
2. 为内部模块构造器创建 SynthKernel context。
3. 注入已加载的 `settings` 对象，合并声明的 context 键：`settings`、`root`、`events` 和 `i18n`。
4. 从本地模块目录加载已启用的外部模块。
5. 添加插件设置页。
6. 按插入顺序对每个内部和已加载模块调用 `start()`。

卸载时，带 `dispose()` 的模块以相反顺序被调用。这让后启动的模块（例如 UI 和引导模块）能在它们使用的服务消失之前释放资源。

初始 context 还贡献了 Obsidian 原语，例如 `app`、`addCommand`、`addRibbonIcon`、`addStatusBarItem`、`registerEvent` 和 `saveSettings`。因此模块依赖的是小的结构化 context 契约，而不是自己去导入或寻找单例服务。

## SynthKernel 依赖注入

每个模块是一个类构造器。SynthKernel 先构造内部构造器，然后从合并的 context 中解析构造器参数。模块通过属性发布能力，例如：

```ts
root = { executeSync: this.executeSync };
```

它还可以声明自己向合并键贡献的值的形状：

```ts
declare readonly events: {
    syncStarted: { isCancelled: Ref<boolean>; trigger: string };
};
```

这些声明让最终的 `Context`、`Events`、`Settings` 和 `Translations` 类型从模块元组推导而来。它们不是第二个运行时注册表：SynthKernel 合并的是实际的 `root` 对象，并把选定的共享键注入模块实例。

context 也支持动态组合。`Extensibility` 验证并导入一个外部构造器，调用 SynthKernel 的 `__addModule__`，用 `__getModule__` 取回它的实例，并把构造器加入插件的生命周期集合。加载的模块接收与核心模块相同的合并 context。

SynthKernel 还提供跨模块边界使用的响应式原语。`Ref` 值携带活跃状态，例如空闲状态、取消和进度；`computed()` 推导展示状态；`hook()` 在弹窗 UI 中持有作用域内的订阅。例如，`Sync` 为每次运行创建一个取消 `Ref` 并通过事件总线发布，文件系统和请求层观察同一个引用。

## 内部模块

`internalModules` 是 `packages/plugin/src/index.ts` 中的有序元组。顺序影响构造、启动和卸载。

1. **`EventBus`** 提供带类型的 `on`/`dispatch` 边界。它持有同步与一般日志，跟踪空闲状态，并记录任务结果。每个订阅返回一个取消订阅回调。
2. **`I18n`** 为当前 Obsidian 语言选择翻译，注册核心和外部模块的资源，并提供带类型的字符串或 `DocumentFragment` 翻译函数。
3. **`Storage`** 持有 Uni-KV 内存数据库和 IndexedDB 数据库。它暴露持久的记录存储、模块元数据存储和每个本地 / 远端配对的命名空间。
4. **`Extensibility`** 发现模块元数据、验证来源与完整性、加载启用的 JavaScript 模块、持久化元数据，并管理启用、禁用、更新和卸载操作。它的安全与信任规则记录在[扩展性契约](./extensibility)中。
5. **`Setting`** 持有原生 Obsidian 设置页、嵌套的设置定义树、模块设置注册、标签和设置页刷新。
6. **`Registrar`** 是能力与注册表层。它创建本地和远端文件系统、应用请求中间件和包装器、选择优化器和冲突解决器、按策略给状态分桶并分发给决策器、归约触发器条目，并向模块暴露注册函数。
7. **`Sync`** 执行一次同步运行：初始化基础设施、遍历两侧、过滤状态、创建并转换任务、请求确认、执行任务并发布生命周期事件。见[核心同步流程](./sync)。
8. **`Observability`** 把事件转换为用户可见的状态、进度、通知、命令、侧边栏控件和导出的日志。进度弹窗消费它的响应式值。
9. **`Scheduler`** 把手动、启动、定时、焦点、实时和仓库变更触发器转换为排队的同步请求。它等待空闲状态、合并待处理请求、把批次的触发器归约到最高优先级的已注册条目，并让批次中的每个请求得到相同的结果。
10. **`ProgressModal`** 处理进度显示、任务确认、删除确认、取消和失败任务详情。SynthKernel 的 `computed()` 值和 `hook()` 清理让弹窗状态限定在弹窗生命周期内。
11. **`Bootstrap`** 通过 `Registrar` 安装内置的同步能力，并提供核心翻译。设置由 `Setting` 注册，它启动早于 `Bootstrap` 完成插件生命周期。

依赖方向在构造器中刻意可见。例如，`Sync` 接收 `initializeSync`、`decideTasks` 和 `getConflictResolver`；它不知道是哪个后端、包装器或中间件提供了它们。`Bootstrap` 组装这些策略，而不改变同步算法。

## 扩展性框架

外部模块在运行时扩展同一个 context。`Extensibility` 验证并导入一个已批准的构造器，把它加入 SynthKernel，合并它的 `moduleSettings`，并把它加入 `allModules` 使其参与启动与卸载。卸载时调用 `dispose()`、移除构造器并发布 `moduleUnloaded`。

模块加载器同时是安全边界，因为模块是可执行代码。信任、完整性验证、启用、存储和运行时权限在[扩展性契约](./extensibility)中规定；模块管理界面的行为见[模块管理界面](./module-management-page)。

## 注册模式

大多数扩展点由 `Registrar.root` 以 `register*` 函数暴露。这个模式把注册与消费分开：

- 集合型能力使用 `setRegister()`。它加入一个条目并返回 `() => registry.delete(entry)`。
- ID 型能力使用 `mapRegister()`。它以 ID 存储条目并返回 `() => registry.delete(id)`。
- CSS 注册追加一个样式元素并返回移除函数。
- `registerI18n()` 遵循语言选择规则，而不是 Registrar 注册表。

例子包括 `registerRemoteFs`、`registerRemoteFsWrapper`、`registerRemoteRequestMiddleware`、`registerTrigger`、`registerDecider`、`registerConflictResolver`、`registerSetting` 和它们的本地对应版本。因此模块可以添加后端、策略、包装器或 UI 贡献，而不修改核心代码。

注册条目按各自的角色被消费：

- **工厂与 ID 映射**：所选的远端后端和冲突解决器按设置中的 ID 查找；决策器在规划期间按策略名称查找。缺失的 ID 以明确的错误失败。
- **包装器**：请求和文件系统包装器按数字优先级分组，按优先级升序应用。同一优先级内，第一个返回替换值的包装器生效；返回 `undefined` 表示放弃当前值。
- **首个匹配的流水线**：优化器同样按优先级排序。第一个返回结果的条目为该操作提供实现。
- **触发器**：触发器条目以触发器名称为键。冲刷的同步批次被归约到最高优先级的条目，由它的选项定制这次运行。
- **设置**：设置定义树按优先级排序并合并进原生插件设置页。见[设置与界面](../development/settings-and-ui)。

Bootstrap 用同样的 API 组装生产流水线。例如，取消、速率限制、重试、自定义请求头、内存控制、优化、context 缓存和非对称存储都是围绕基础请求与文件系统实现分层叠加的独立注册。它们的行为在[请求中间件](./request-middleware)和[文件系统包装器](./file-system-wrappers)中规定。

这让 Sync Engine 拥有稳定的核心算法，策略和传输层都可以替换。模块在启动时组合能力，通过带类型的 context API 消费它们，卸载时用同一个生命周期契约移除它们。
