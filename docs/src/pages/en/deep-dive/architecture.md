# Sync Engine Architecture

Sync Engine is composed as an ordered set of internal modules. The plugin entrypoint supplies those modules to [SynthKernel](https://github.com/hesprs/synthkernel), a small dependency-injection and reactivity runtime. The result is one typed context shared by the core, UI, and dynamically loaded modules.

The architecture has three boundaries:

- **Kernel boundary**: SynthKernel constructs modules, injects their dependencies, and merges their public APIs into one context.
- **Capability boundary**: Registrar exposes typed factories and registries for file systems, requests, sync decisions, settings, and other extension points.
- **Execution boundary**: Sync operates on abstract local and remote file systems. Platform details enter through `VaultRequest`, `Request`, middleware, and file-system wrappers.

The [core sync routine](./sync), [request abstraction](./request), and [file-system wrappers](./file-system-wrappers) specify those execution boundaries in detail.

## Runtime Lifecycle

`SyncEngine.onload()` performs the following sequence:

1. Load settings.
2. Create a SynthKernel context for the internal module constructors.
3. Inject the loaded `settings` object and merge the declared context keys: `settings`, `root`, `events`, and `i18n`.
4. Load enabled external modules from the local module directory.
5. Add the plugin settings tab.
6. Call `start()` on every internal and loaded module in insertion order.

On unload, modules with `dispose()` are called in reverse order. This gives later modules, such as UI and bootstrap modules, a chance to release resources before the services they use disappear.

The initial context also contributes Obsidian primitives such as `app`, `addCommand`, `addRibbonIcon`, `addStatusBarItem`, `registerEvent`, and `saveSettings`. Modules therefore depend on small structural context contracts instead of importing or locating singleton services themselves.

## SynthKernel Dependency Injection

Each module is a class constructor. SynthKernel constructs the internal constructors once, then resolves constructor parameters from the merged context. A module publishes capabilities through properties such as:

```ts
root = {
  executeSync: this.executeSync,
};
```

It can also declare the shape of values it contributes to merged keys:

```ts
declare readonly events: {
    syncStarted: { isCancelled: Ref<boolean>; trigger: string };
};
```

The declarations make the final `Context`, `Events`, `Settings`, and `Translations` types derive from the module tuple. They are not a second runtime registry: SynthKernel merges the actual `root` objects and injects the selected shared keys into module instances.

The context supports dynamic composition as well. `Extensibility` verifies and imports an external constructor, calls SynthKernel's `__addModule__`, retrieves its instance with `__getModule__`, and adds the constructor to the plugin's lifecycle set. A loaded module receives the same merged context as core modules.

SynthKernel also supplies reactive primitives used across module boundaries. `Ref` values carry live state such as idle status, cancellation, and progress; `computed()` derives display state; and `hook()` owns scoped subscriptions in modal UI. For example, `Sync` creates one cancellation `Ref` per run and publishes it through the event bus, while file-system and request layers observe that same reference.

## Internal Modules

`internalModules` is an ordered tuple in `packages/plugin/src/index.ts`. Order matters for construction, startup, and disposal.

1. **`EventBus`** provides the typed `on`/`dispatch` boundary. It owns sync and general logs, tracks idle state, and records task outcomes. Every subscription returns an unsubscribe callback.
2. **`I18n`** selects translations for the current Obsidian language, registers resources from core and external modules, and provides typed string or `DocumentFragment` translation functions.
3. **`Storage`** owns the Uni-KV memory database and IndexedDB database. It exposes persistent record stores, module metadata storage, and per-local/remote-pair namespaces.
4. **`Extensibility`** discovers module metadata, validates sources and integrity, loads enabled JavaScript modules, persists metadata, and manages enable, disable, update, and unload operations. Its security and trust rules are documented in the [Extensibility Contract](./extensibility).
5. **`Setting`** owns the native Obsidian settings tab, nested setting-definition tree, module setting registration, labels, and settings-page refreshes.
6. **`Registrar`** is the capability and registry layer. It creates local and remote file systems, applies request middleware and wrappers, selects listers, optimizers, deciders, and conflict resolvers, and exposes registration functions to modules.
7. **`Sync`** executes one sync run: initialize infrastructure, traverse both sides, filter stats, create and transform tasks, request confirmations, execute tasks, and publish lifecycle events. See [Core Sync Routine](./sync).
8. **`Observability`** converts events into user-visible status, progress, notices, commands, ribbon controls, and exported logs. Its reactive values are consumed by the progress modal.
9. **`Scheduler`** turns manual, startup, scheduled, realtime, and vault-change triggers into queued sync requests. It waits for idle state, batches pending requests, and resolves every request in a batch with the same result.
10. **`ProgressModal`** handles progress display, task confirmation, deletion confirmation, cancellation, and failed-task details. SynthKernel `computed()` values and `hook()` cleanup keep modal state scoped to the modal lifecycle.
11. **`Bootstrap`** installs built-in sync capabilities through `Registrar` and supplies core translations. Settings are registered by `Setting`, which starts before `Bootstrap` completes the plugin lifecycle.

The dependency direction is intentionally visible in the constructors. For example, `Sync` receives `initializeSync`, `listRemote`, `getDecider`, and `getConflictResolver`; it does not know which backend, wrapper, or middleware supplied them. `Bootstrap` assembles those policies without changing the sync algorithm.

## Extensibility Framework

External modules extend this same context at runtime. `Extensibility` verifies and imports an approved constructor, adds it to SynthKernel, merges its `moduleSettings`, and adds it to `allModules` so it participates in startup and disposal. Unloading invokes `dispose()`, removes the constructor, and dispatches `moduleUnloaded`.

The module loader is also a security boundary because modules are executable code. Trust, integrity verification, enablement, storage, and runtime privileges are specified in the [Extensibility Contract](./extensibility); module-management UI behavior is covered in [Module Management UI](./module-management-page).

## Registration Pattern

Most extension points are exposed by `Registrar.root` as `register*` functions. The pattern separates registration from consumption:

- Set-backed capabilities use `setRegister()`. It adds an entry and returns `() => registry.delete(entry)`.
- ID-backed capabilities use `mapRegister()`. It stores an entry under an ID and returns `() => registry.delete(id)`.
- CSS registration appends a style element and returns a remover.
- `registerI18n()` follows language selection rules rather than the Registrar registries.

Examples include `registerRemoteFs`, `registerRemoteFsWrapper`, `registerRemoteRequestMiddleware`, `registerRemoteLister`, `registerDecider`, `registerConflictResolver`, `registerSetting`, and their local counterparts. A module can therefore add a backend, policy, wrapper, or UI contribution without modifying core code.

Registration entries are consumed according to their role:

- **Factories and ID maps:** the selected remote backend, decider, and conflict resolver are looked up by the ID in settings. Missing IDs fail with an explicit error.
- **Wrappers:** request and file-system wrappers are grouped by numeric priority and applied in ascending priority order. Within one priority, the first wrapper that returns a replacement wins; returning `undefined` declines the current value.
- **First-match pipelines:** listers and optimizers are also priority ordered. The first entry that returns a result supplies the implementation for that operation.
- **Settings:** setting-definition trees are ordered by priority and merged into the native plugin settings tab. See [Settings and UI](../development/settings-and-ui).

Bootstrap uses these same APIs to build the production pipeline. For example, cancellation, rate limiting, retry, custom headers, memory control, optimization, context caching, and asymmetric storage are independent registrations layered around the base request and file-system implementations. Their behavior is specified in [Request Middleware](./request-middleware) and [File System Wrappers](./file-system-wrappers).

This gives Sync Engine a stable core algorithm with replaceable policy and transport layers. Modules compose capabilities at startup, consume them through typed context APIs, and remove them through the same lifecycle contract when unloaded.
