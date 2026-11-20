# 文件系统抽象

插件把文件系统接口抽象为统一的文件系统类 `RootFs`，定义于 `packages/plugin/src/fs/interface.ts`。所有抽象都设计为在每次同步运行中不可变、可抛弃。

不同类型的[包装器](./file-system-wrappers)可以叠加在统一接口之上。它们的存在让文件系统功能可以轻松扩展。原始 FS 类不应携带任何附加功能，例如基目录配置或重试，这些都应通过包装器实现。

## Vault 抽象

Vault 文件系统消费 [`VaultRequest`](./request#vault-request)，一个抽象 Obsidian vault API 的带类型操作函数。

`constructor()`：接收一个 `VaultRequest` 和仓库名称。

`getUid()`：返回 `obsidian-vault~<vault-name>`。

`read()`：委托给 `VaultRequest` 的 `GET`，它包装 `vault.adapter.readBinary()` 并把结果转换为 `Binary`。

`readStream()`：委托给 `GET_STREAM`，使用提供的 stat 中的文件大小。`size` 在没有本地文件流支持的平台上启用基于范围的流式传输，见[请求](./request#vault-request)。

`write()`：委托给 `PUT`，把文件 `meta` 中的 `ctime` 和 `mtime` 作为 Obsidian `DataWriteOptions` 传入，然后调用 `this.stat()` 并返回文件 UID。

`writeStream()`：

- 创建 `.trash/<random-UUID>.part`，需要时先创建 `.trash`
- 读取输入流，用 `APPEND` 追加每个分块，并把文件 `meta` 中的 `ctime` 和 `mtime` 作为 `DataWriteOptions` 传入
- 移除已存在的目标，然后把临时文件移动到位
- 调用 `this.stat()` 并返回文件 UID
- 失败时取消输入流，并永久删除临时文件

`delete()`：委托给 `DELETE`，遵循用户的垃圾桶选项。`vault.config.trashOption: "none"` 调用 `vault.adapter.remove()` 做永久删除。`"local"` 直接调用 `trashLocal()`；`"system"` 或未设置时先尝试 `trashSystem()`，需要时回退到 `trashLocal()`。

`move()`：委托给 `MOVE`，在规范化目标路径后包装 `vault.adapter.rename()`。

`mkdir()`：委托给 `MKDIR`，包装 `vault.adapter.mkdir()`。创建根目录是无操作。

`stat()`：

- 委托给 `STAT`
- `workspace.layoutReady` 时使用缓存的 `TFile`/`TFolder` 元数据；否则回退到 `vault.adapter.stat()`
- 把文件结果转换为项目的 `Stat` 格式，`uid` 为 `mtime` + `size` 用 `~` 分隔，`meta` 以字符串返回 `ctime` 和 `mtime`；文件夹没有 UID

`list()`：以并发请求递归遍历后代。`LIST` 在布局就绪时使用缓存的文件夹子项，否则用 `vault.adapter.list()`。每个文件随后经过 `stat()`，文件夹条目直接返回。被查询的根目录不包含在结果中。

`exists()`：先检查 `vault.getAbstractFileByPath()`，然后回退到 `vault.adapter.exists(path, true)`。

## 统一键模式

所有抽象文件系统都应自动在统一键和它们的原生文件路径之间转换：

- `/` 是根目录。
- 文件没有尾部斜杠。
- 文件夹有尾部斜杠。
- 非根路径没有前导斜杠。

例如：

- 根目录：`/`
- `file.md`、`folder/file.md` 表示文件。
- `folder/`、`folder/folder/` 表示文件夹。

## 优化器

执行期间，本地和远端文件系统使用优化包装器。它们批量收集修改调用并调用第一个已注册的优化器；批量与依赖处理记录在[优化包装器](./file-system-wrappers#optimization-wrapper)。

流程把任务排序为文件删除、目录创建、移动、目录删除和剩余操作，然后并发执行优化后的任务列表。运行报告 `completed`、`failed`、`cancelled` 或 `noop`。
