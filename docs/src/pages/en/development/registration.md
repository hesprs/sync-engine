# Registration

`Context` provides `register*` methods for modules to contribute capabilities. Every method returns a cleanup callback except `registerEvent` (hands Obsidian `EventRef` to plugin cleanup) and `registerI18n` (returns `void`). Store cleanup callbacks and invoke them from `dispose`.

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

## Filesystem Wrappers

Register middleware that wraps the local or remote filesystem. See [file system: wrapper chain](./file-system#wrapper-chain) for implementation guidance.

```ts
type FsWrapperEntry = { priority: number; apply: (fs: Fs) => Fs | undefined };
```

```ts
ctx.registerLocalFsWrapper(entry: FsWrapperEntry): () => boolean;
ctx.registerRemoteFsWrapper(entry: FsWrapperEntry): () => boolean;
```

Returning `undefined` from `apply` declines the entry.

## Backends

Register a remote backend implementation. See [file system: RootFs](./file-system#rootfs) for the contract.

```ts
type CheckConnectionResult = { success: true } | { success: false; reason: string };

type RemoteFsEntry = {
  prettyName: () => string;
  instantiate: (request: Request) => RootFs;
  checkConnection: (request: Request) => MaybePromise<CheckConnectionResult>;
};
```

```ts
ctx.registerRemoteFs(id: string, entry: RemoteFsEntry): () => boolean;
```

## Batch Optimizers

Register local or remote batch optimizers. See [file system: batch optimization](./file-system#batch-optimization) for atom behavior.

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

## Request Middleware

Register remote or local request middleware. See [request middleware](./request#middleware) for the two separate systems.

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

## Remote Lister

Register a remote listing strategy. See [sync: remote lister](./sync#remote-lister).

```ts
type RemoteListerEntry = {
  priority: number;
  apply: (info: Parameters<RemoteLister>[0]) => MaybePromise<Array<Stat>> | undefined;
};
```

```ts
ctx.registerRemoteLister(entry: RemoteListerEntry): () => boolean;
```

## Decider

Register a sync decision strategy. See [sync: decider](./sync#decider).

```ts
type DeciderEntry = { decider: Decider; prettyName: () => string };
```

```ts
ctx.registerDecider(id: string, entry: DeciderEntry): () => boolean;
```

## Conflict Resolver

Register a conflict resolution strategy. See [sync: conflict resolver](./sync#conflict-resolver).

```ts
type ConflictResolverEntry = { prettyName: () => string; resolver: ConflictResolver };
```

```ts
ctx.registerConflictResolver(id: string, entry: ConflictResolverEntry): () => boolean;
```

## Settings and UI

Register nested setting definitions, translations, and migration-aware controls as described in [Settings and UI](./settings-and-ui).

## CSS

```ts
ctx.registerCss(css: string): () => void;
```

Injects CSS into the document. Returns a callback that removes the injected style element.

## Events

Pass Obsidian event references for automatic plugin cleanup. See [events](./events).

```ts
ctx.registerEvent(ref: EventRef): void;
```
