# 文件系统包装器

包装器是围绕[文件系统](./file-system) `Fs` 实例的工厂函数，拦截原始 FS 的行为。包装器函数在第一个参数接收原始 FS 并返回一个 `Fs`。覆盖型包装器返回带 `original` 成员的 `WrappedFs`；注入型包装器修改给定的 FS 并返回它。同一个 FS 实例可以叠加无限层覆盖包装器。

SDK 的规范 `prefixWrapper` API 和用法示例记录在[开发：文件系统](../development/file-system#prefixwrapper)。

没有任何包装器的根 FS 类型为 `RootFs`。`Fs` 是 `RootFs` 与 `WrappedFs` 的联合类型。

包装器有两类：

- **注入型包装器**：通过直接重新赋值公开成员改变给定 FS 的部分方法。不产生新层。
- **覆盖型包装器**：最常见，在原始 FS 之上叠加一层新的包装。

## 内存控制包装器

- 目标：本地和远端 `Fs`
- 优先级：两者均为 `1000`

当前在 Bootstrap 中禁用，因为浏览器 GC 不可靠。有一条 `TODO` 计划在 Obsidian 最低 iOS 版本达到 16.4、`ResizableArrayBuffer` 可以手动释放内存后重新启用。启用时它同时作用于本地和远端，并接收一个共享的 `MemoryControlSharedState`，包含 `memoryConsumption`、`hangingOperations` 和 `maxMemory`。

`hangingOperations` 池按传输大小（`stat.size`）降序保持排序，因此更长的传输先恢复。这让大文件分布到整个同步过程的前段，而不是被推迟到利用率低下的尾段。

只拦截 `read`、`readStream`、`write`、`writeStream` 调用：

1. `read()` 和 `readStream()` 到来时，预留 `min(stat.size, 16 MiB)`。内存不足时把操作放入排序池并延迟。失败时释放预留并恢复排队操作。消费量为零时，允许一个操作超过 `maxMemory`。
2. `write()` 和 `writeStream()` 不预留内存。任一完成或失败时，释放 `min(stat.size, 16 MiB)`，内存允许时恢复排队的读操作。

恢复时，包装器扫描整个池，纳入所有放得下的操作，跳过放不下的大操作。这种回填让剩余预算被较小的传输填满，而不是停在一个超大操作后面。

## 优化包装器

- 目标：本地和远端 `Fs`
- 优先级：两者均为 `2000`
- 机制：`setTimeout(..., 0)` 调度的原子队列

### 后端相关的优化

同步流程必须保持与后端无关，但最优执行策略各不相同（例如 WebDAV 需要按顺序创建父目录；S3 允许并发上传；Dropbox 把删除和移动合并进批量端点）。这个包装器在根层拦截 FS API 调用，在 promise 内重排、批量或调度执行，把逻辑与优化解耦。

后端可以用后端专属方法扩展 `RootFs`。批量优化器可以通过 `instanceof` 检查拿到 FS 并使用这些方法。

### 操作合并

合并使用零延迟定时器：修改调用（`write`、`writeStream`、`delete`、`mkdir`、`move`）作为 `InputAtom` 入队，定时器冲刷时把排队的原子交给注入的 `batchOptimizer`。只读调用（`read`、`readStream`、`getUid`、`stat`、`exists`、`list`）直接透传给原始 FS。`checkConnection` 属于远端后端条目，不属于 `Fs`。

**执行**：

单原子队列直接执行该原子，不做批量。否则包装器把排队的原子交给注入的 `batchOptimizer`，优化器可以重排它们、替换为 `custom` 原子，或 resolve / reject 它们。排队的原子通过 `createCachedPromise()` 共享真实执行和延迟的 promise。

每个输入原子都有 `resolve` 和 `reject` 回调。优化器必须通过 reject 受影响的原子来传播操作失败，包括自定义原子替换它们、或批量操作返回逐键失败的情况。被移除的原子必须总是被 settle，否则它们原始的 promise 永远 pending。

## 非对称存储包装器

- 目标：远端 `Fs`
- 优先级：`11000`，仅在启用非对称存储时

启用非对称存储时应用于远端 FS。它把层级化的文件和文件夹键压平为锚定键，委托之后还原层级化的状态和进度。文件夹由空文件表示。见[非对称存储规范](./asymmetric-storage)。

## Context 包装器

- 目标：本地和远端 `Fs`
- 优先级：本地 `20000`；远端 `20000`，启用非对称存储时远端再加 `10000`

拦截 `list()`、`stat()`、`write()`、`writeStream()`、`delete()`、`move()` 和 `mkdir()` 调用，在一个跨同步运行存活的 `uni-kv` 内存存储中构建尽力而为的已知状态副本。

`read()` 和 `readStream()` 原样透传。FS 接口要求文件状态。

Bootstrap 使用这些存储：

- `localContext20000`
- `remoteContext10000`
- `remoteContext20000`

行为：

- `stat()` 时，把返回的状态 upsert 进 KV 存储
- `list()` 时，清空存储并按列表结果重建
- `write()` 或 `writeStream()` 时，把提供的状态与返回的 UID upsert
- `delete()` 时，删除记录。
- `move()` 时，把缓存的记录移到新键并修改它的 `key` 字段。
- `mkdir()` 时，upsert 文件夹记录。
- 所有内存数据库修改只在原始操作成功并返回之后发生。
- 包装器创建时，把它的标记与当前 FS UID 比较。不一致时清空存储并更新标记。

## 取消包装器

- 目标：本地和远端 `Fs`
- 优先级：两者均为 `3000`

第二个参数接收 `isCancelled: Ref<boolean>` 以检测同步取消。

拦截除 `getUid()` 外的所有 `Fs` 方法。转发前后检查取消状态，取消时以抛出异常包装所有方法调用。特殊情况：`read()` 和 `readStream()` 只在**转发前**检查取消，`write()` 和 `writeStream()` 只在**转发后**检查，以防止取消竞态阻塞内存控制计数器的释放。

## 调试包装器

仅开发用的 `debugWrapper` 覆盖一个 FS 并记录每次方法调用。它从 SDK 开发入口导出，不属于运行时包装器链。

### 前缀包装器

`prefixWrapper` 是可导入的 SDK 包装器，把一个目录暴露为另一个 `Fs` 的根：

它的类型是 `prefixWrapper(original: Fs, prefix: string): WrappedFs`。

包装器把 `prefix` 规范化为统一的目录键：Unicode 规范化、百分号编码的路径段被解码、空的斜杠段被移除、并加上尾部 `/`。委托文件系统操作时，它在前面加上规范化后的前缀。返回的状态键、列表结果和列表进度路径会去掉前缀；被包装的目录本身暴露为 `/`，并从递归列表结果中省略。返回的前缀之外的路径以错误拒绝。
