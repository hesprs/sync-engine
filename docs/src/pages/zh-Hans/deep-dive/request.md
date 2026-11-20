# 请求抽象

Sync Engine 暴露两个带类型的请求函数：

- `Request` 负责远端 HTTP 操作
- `VaultRequest` 负责本地 Obsidian vault 操作

两者都是返回 promise 的函数对象。它们在文件系统实现与底层平台 API 之间提供一个小的、对中间件友好的边界。

## Request

`Request` 定义于 `packages/plugin/src/modules/Registrar.ts`：

```ts
type Request = (url: string, params?: RequestParam) => Promise<RequestResponse>;
```

`RequestParam` 遵循 Obsidian 的 `RequestUrlParam`，除了 `body` 使用项目的 `Binary`（`Uint8Array`）而不是 Obsidian 原始 API 的 `ArrayBuffer`，且 `url` 从参数移到第一个实参。省略 `params` 对该 URL 执行普通的 `GET`。

`RequestResponse` 是 SDK 导出的类型，描述 `Request` 返回的响应。

### 实现

基础实现：

1. 把 `Uint8Array` body 转换为 `ArrayBuffer`。
2. 调用 Obsidian 的 `requestUrl()`。
3. 把结果包装为：
   - `status`：HTTP 状态码
   - `headers`：响应头
   - `text()`：响应文本
   - `json()`：解析后的 JSON
   - `bytes()`：响应 `ArrayBuffer` 转换为 `Binary`

远端文件系统模块从 context 接收 `getRequest()`，而不是直接拿到底层函数。`Registrar` 在返回之前按优先级顺序应用已注册的远端请求中间件。因此每个远端 FS 操作都通过同一个抽象完成认证、请求头、重试、速率限制和取消。

### 限制

- Obsidian 的 `requestUrl()` 只接受完整的字符串或 `ArrayBuffer` body。`Request` 无法上传 `ReadableStream`。
- `requestUrl()` 不通过这个抽象暴露响应体流。`bytes()` 会物化完整响应。
- 流式远端读取必须在 `Request` 之上实现，通常用多个 range 请求。流式写入必须使用后端专属的分片上传协议。
- HTTP 状态 `400` 及以上时，请求错误通常由 `requestUrl()` 抛出。重试行为属于请求中间件，不属于这个基础实现。

## Vault Request

`VaultRequest` 是 `VaultFs` 使用的本地对应版本，聪明地利用 Obsidian vault 缓存提升性能。它是一个可辨识联合的操作函数：

```ts
type VaultRequest = <T extends VaultRequestParam = { method: 'GET' }>(
  key: string,
  params?: T,
) => Promise<VaultRequestResponseMap[T['method']]>;
```

支持的方法是 `GET`、`GET_STREAM`、`PUT`、`APPEND`、`DELETE`、`MOVE`、`MKDIR`、`EXISTS`、`STAT` 和 `LIST`。方法同时决定必需参数和响应类型。

`createVaultRequest(app)` 捕获 `app.vault`、它的 `DataAdapter` 和 `app.workspace`。`Registrar` 在把函数注入 `VaultFs` 之前应用本地请求中间件。

### 路径转换

请求键使用[统一文件系统键模式](./file-system#统一键模式)。

调用适配器之前，`VaultRequest` 从每个非根路径移除尾部斜杠，因为 Obsidian 路径不使用文件夹斜杠。`LIST` 把返回的文件夹路径转换回统一形式。

### 操作映射

- `GET`：`adapter.readBinary()`，转换为 `Binary`。
- `GET_STREAM`：需要文件 `size`。在 iOS/iPadOS 上，文件通过多个 range 的 `fetch` `GET` 请求流式读取，因为 Capacitor 5 只对媒体扩展名支持 ranged 本地文件请求。非媒体文件先复制为 `.trash/<random-UUID>.mov` 伪装成媒体文件，需要时创建 `.trash`；流完成、出错或取消后删除副本。其他平台获取 `adapter.getResourcePath(path)` 并返回 `response.body`；没有 body 时抛出异常。
- `PUT`：`adapter.writeBinary()`，把 `Binary` 转换为 `ArrayBuffer` 并转发可选的 `mtime`/`ctime` 头。
- `APPEND`：`adapter.appendBinary()`，使用相同的转换和头。
- `DELETE`：按用户垃圾桶选项调用 `adapter.remove()`、`adapter.trashLocal()`、`adapter.trashSystem()`。
- `MOVE`：`adapter.rename()` 到规范化后的目标路径。
- `MKDIR`：调用 `adapter.mkdir()`。创建 `/` 是无操作。
- `EXISTS`：先检查 `vault.getAbstractFileByPath()`，然后回退到 `adapter.exists(path, true)`。
- `STAT`：返回一个 Obsidian `Stat` 类型的状态对象；启用 `cached` 时，`workspace.layoutReady` 使用缓存的 `TFile`/`TFolder` 对象，否则回退到 `adapter.stat()`。
- `LIST`：启用 `cached` 时，布局就绪且键不是 `/` 时使用缓存的 `TFolder.children`；否则用 `adapter.list()`。文件夹结果以尾部斜杠规范化。

## 边界

`Request` 抽象 HTTP 传输；`VaultRequest` 抽象 vault 适配器访问。两者都不执行文件系统策略，例如重试、内存控制、路径压平或取消。这些行为由对应的中间件和 FS 包装器提供。
