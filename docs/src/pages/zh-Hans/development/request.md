# 请求

Sync Engine 有两套请求系统：`Request` 负责远端 HTTP 调用，`VaultRequest` 负责本地仓库操作。两者都支持中间件包装。请求的内部实现细节见[深入解析：请求](../deep-dive/request)和[深入解析：请求中间件](../deep-dive/request-middleware)。

## `Request`

远端 HTTP 请求函数。后端在构造函数中接收一个组合好的 `Request` 实例，所有网络调用必须使用它。

```ts
type RequestParam = Omit<RequestUrlParam, 'body' | 'url'> & {
  body?: string | Binary;
  ignoreCancellation?: boolean;
};

type RequestResponse = {
  text: () => string;
  bytes: () => Binary;
  json: <T extends object = object>() => T; // typed JSON
  headers: Record<string, string>;
  status: number;
};

type Request = (url: string, params?: RequestParam) => Promise<RequestResponse>;
```

`RequestParam` 扩展了 Obsidian 的 `RequestUrlParam`（去掉 `body` 和 `url`），增加了一个接受 `string | Binary` 的 `body` 字段。URL 永远是第一个参数；省略 `params` 执行普通的 `GET`。`RequestResponse` 是 SDK 导出的类型，对应 `Request` 的响应。

把 `ignoreCancellation` 设为 `true`，请求可以在同步被取消后继续执行。把它留给清理调用，用于释放后端已经创建的远端资源，例如中止一次未完成的分片上传。

## `VaultRequest`

本地仓库操作函数，由本地文件系统使用。模块很少直接与 `VaultRequest` 交互，但它被导出用于高级用例。

```ts
type VaultRequestParam = (
  | { method: 'GET' }
  | { method: 'GET_STREAM'; size: number }
  | { method: 'PUT'; value: Binary; mtime?: number; ctime?: number }
  | { method: 'APPEND'; value: Binary; mtime?: number; ctime?: number }
  | { method: 'DELETE'; trash?: TrashOption }
  | { method: 'MOVE'; destination: string }
  | { method: 'MKDIR' }
  | { method: 'EXISTS' }
  | { method: 'STAT'; cached?: boolean }
  | { method: 'LIST'; cached?: boolean }
) & { ignoreCancellation?: boolean };

type VaultRequest = <T extends VaultRequestParam = { method: 'GET' }>(
  key: string,
  params?: T,
) => Promise<VaultRequestResponseMap[T['method']]>;
```

方法到 Obsidian 适配器的映射见[深入解析：请求](../deep-dive/request#vault-request)。

布局就绪时，`STAT` 和 `LIST` 默认使用缓存的仓库对象。把 `cached` 设为 `false` 可以绕过缓存，改为查询仓库适配器。省略时该选项默认为 `true`。

## 中间件

请求中间件按 `priority` 升序包装请求函数。有**两套独立的中间件系统**：远端和本地。

```ts
type RemoteRequestMiddlewareEntry = {
  priority: number;
  apply: (request: Request) => Request | undefined;
};
type LocalRequestMiddlewareEntry = {
  priority: number;
  apply: (request: VaultRequest) => VaultRequest | undefined;
};
```

`apply` 返回 `undefined` 表示放弃该优先级的条目。内置中间件（重试、速率限制、取消、自定义请求头）见[深入解析：请求中间件](../deep-dive/request-middleware)。

### 注册中间件

见[注册](./registration#request-middleware)。
