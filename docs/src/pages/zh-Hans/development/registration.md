# 注册

`Context` 提供 `register*` 方法，让模块贡献能力。除 `registerEvent`（把 Obsidian `EventRef` 交给插件清理）和 `registerI18n`（返回 `void`）外，每个方法都返回一个清理回调。保存清理回调并在 `dispose` 中调用它们。

```ts
export default class MyModule {
  private readonly cleanup: Array<() => void> = [];
  constructor(private readonly ctx: Context) {}

  start(): void {
    this.cleanup.push(this.ctx.registerRemoteFsWrapper(/* ... */));
    this.ctx.registerI18n('en', { hello: 'Hello' });
  }

  dispose(): void {
    this.cleanup.splice(0).forEach((fn) => fn());
  }
}
```

## 文件系统包装器

注册包装本地或远端文件系统的中间件。实现指引见[文件系统：包装器链](./file-system#包装器链)。

```ts
type FsWrapperEntry = { priority: number; apply: (fs: Fs) => Fs | undefined };
```

```ts
ctx.registerLocalFsWrapper(entry: FsWrapperEntry): () => boolean;
ctx.registerRemoteFsWrapper(entry: FsWrapperEntry): () => boolean;
```

`apply` 返回 `undefined` 表示放弃该条目。

## 后端

注册一个远端后端实现。契约见[文件系统：RootFs](./file-system#rootfs)。

```ts
type RemoteFsEntry = {
  prettyName: () => string;
  instantiate: (request: Request) => RootFs;
  checkConnection: (request: Request) => MaybePromise<void | Error>;
};
```

`checkConnection` 成功时 resolve `undefined`，失败时 resolve 携带原因的 `Error`。

```ts
ctx.registerRemoteFs(id: string, entry: RemoteFsEntry): () => boolean;
```

## 批量优化器

注册本地或远端批量优化器。原子的行为见[文件系统：批量优化](./file-system#批量优化)。

```ts
type OptimizerEntry = {
  priority: number;
  apply: (input: OptimizerInput) => OptimizerOutput | undefined;
};
```

```ts
ctx.registerLocalOptimizer(entry: OptimizerEntry): () => boolean;
ctx.registerRemoteOptimizer(entry: OptimizerEntry): () => boolean;
```

## 请求中间件

注册远端或本地请求中间件。两套独立的系统见[请求中间件](./request#中间件)。

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

```ts
ctx.registerRemoteRequestMiddleware(entry: RemoteRequestMiddlewareEntry): () => boolean;
ctx.registerLocalRequestMiddleware(entry: LocalRequestMiddlewareEntry): () => boolean;
```

## 同步触发器

为触发器名称注册提供同步选项的条目。见[同步：同步触发器](./sync#同步触发器)。

```ts
type TriggerEntry = { priority: number; options?: () => SyncOptions };
```

```ts
ctx.registerTrigger(key: string, entry: TriggerEntry): () => boolean;
```

## 决策器

注册一个同步决策策略。规划期间状态按注册 ID 分桶，因此每个 ID 同时也是[同步策略](../usage/settings#同步策略)规则中的可选策略。见[同步：决策器](./sync#决策器)。

```ts
type DeciderEntry = { decider: Decider; prettyName?: () => string };
```

```ts
ctx.registerDecider(id: string, entry: DeciderEntry): () => boolean;
```

## 冲突解决器

注册一个冲突解决策略。见[同步：冲突解决器](./sync#冲突解决器)。

```ts
type ConflictResolverEntry = { prettyName: () => string; resolver: ConflictResolver };
```

```ts
ctx.registerConflictResolver(id: string, entry: ConflictResolverEntry): () => boolean;
```

## 设置与界面

按[设置与界面](./settings-and-ui)中的说明注册嵌套设置定义、翻译和感知迁移的控件。

## CSS

```ts
ctx.registerCss(css: string): () => void;
```

把 CSS 注入文档。返回移除所注入样式元素的回调。

## 事件

传入 Obsidian 事件引用，由插件自动清理。见[事件](./events)。

```ts
ctx.registerEvent(ref: EventRef): void;
```
