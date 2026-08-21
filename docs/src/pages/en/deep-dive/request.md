# Request Abstraction

Sync Engine exposes two typed request functions:

- `Request` for remote HTTP operations
- `VaultRequest` for local Obsidian vault operations

Both are function objects returning promises. They provide a small, middleware-friendly boundary between file-system implementations and their underlying platform APIs.

## Request

`Request` is defined in `packages/plugin/src/modules/Registrar.ts`:

```ts
type Request = (params: RequestParam | string) => Promise<RequestResponse>;
```

`RequestParam` follows Obsidian's `RequestUrlParam`, except `body` uses the project's `Binary` (`Uint8Array`) instead of `ArrayBuffer` in Obsidian raw API. A string argument is treated as a `GET` toward this URL.

`RequestResponse` is an exported SDK type describing the response returned by `Request`.

### Implementation

The base implementation:

1. Converts a `Uint8Array` body to an `ArrayBuffer`.
2. Calls Obsidian `requestUrl()`.
3. Wraps the result as:
   - `status`: HTTP status code
   - `headers`: response headers
   - `text()`: response text
   - `json()`: parsed JSON
   - `bytes()`: response `ArrayBuffer` converted to `Binary`

Remote file-system modules receive `getRequest()` in context, not the base function directly. `Registrar` applies registered remote request middleware in priority order before returning it. Each remote FS operation therefore uses the same abstraction for authentication, headers, retries, rate limiting, and cancellation.

### Limitations

- Obsidian `requestUrl()` accepts only a complete string or `ArrayBuffer` body. `Request` cannot upload a `ReadableStream`.
- `requestUrl()` does not expose a response body stream through this abstraction. `bytes()` materializes the complete response.
- Streaming remote reads must be implemented above `Request`, normally with multiple ranged requests. Streaming writes must either buffer the input or use a backend-specific chunked-upload protocol.
- Request errors are normally thrown by `requestUrl()` for HTTP status `400` and above. Retry behavior belongs to request middleware, not this base implementation.

## Vault Request

`VaultRequest` is the local counterpart used by `VaultFs`, uses Obsidian vault cache smartly to improve performance. It is a discriminated operation function:

```ts
type VaultRequest = <T extends VaultRequestParam>(
  params: T,
) => Promise<VaultRequestResponseMap[T['method']]>;
```

Supported methods are `GET`, `GET_STREAM`, `PUT`, `APPEND`, `DELETE`, `MOVE`, `MKDIR`, `EXISTS`, `STAT`, and `LIST`. The method determines both required parameters and response type.

`createVaultRequest(app)` captures `app.vault`, its `DataAdapter`, and `app.workspace`. `Registrar` applies local request middleware before injecting the function into `VaultFs`.

### Path conversion

The request key uses the [unified file-system key schema](./file-system#unified-key-schema).

Before calling the adapter, `VaultRequest` removes a trailing slash from every non-root path because Obsidian paths do not use folder slashes. `LIST` converts returned folder paths back to the unified form.

### Operation mapping

- `GET`: `adapter.readBinary()`, converted to `Binary`.
- `GET_STREAM`: fetches `adapter.getResourcePath(path)` and returns `response.body`; throws when no body is available. File read streaming is achieved in this way.
- `PUT`: `adapter.writeBinary()`, converting `Binary` to `ArrayBuffer` and forwarding optional `mtime`/`ctime` headers.
- `APPEND`: `adapter.appendBinary()` with the same conversion and headers.
- `DELETE`: calls `adapter.remove()`, `adapter.trashLocal()`, `adapter.trashSystem()` according to user trash options.
- `MOVE`: `adapter.rename()` to the normalized destination path.
- `MKDIR`: calls `adapter.mkdir()`. Creating `/` is a no-op.
- `EXISTS`: checks `vault.getAbstractFileByPath()` first, then fallback to `adapter.exists(path, true)`.
- `STAT`: returns an stat object typed in Obsidian `Stat`; with `cached` enabled, uses cached `TFile`/`TFolder` objects when `workspace.layoutReady`, otherwise falls back to `adapter.stat()`.
- `LIST`: with `cached` enabled, uses cached `TFolder.children` when the layout is ready and the key is not `/`; otherwise uses `adapter.list()`. Folder results are normalized with trailing slashes.

## Boundary

`Request` abstracts HTTP transport; `VaultRequest` abstracts vault adapter access. Neither performs file-system policy such as retries, memory control, path flattening, or cancellation. Those behaviors are supplied by the corresponding middleware and FS wrappers.
