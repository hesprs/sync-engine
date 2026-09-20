# Request

Sync Engine has two request systems: `Request` for remote HTTP calls and `VaultRequest` for local vault operations. Both support middleware wrappers. For internal request implementation details, see [deep dive: request](../deep-dive/request) and [deep dive: request middleware](../deep-dive/request-middleware).

## `Request`

Remote HTTP request function. Backends receive a composed `Request` instance in their constructor and must use it for all network calls.

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

`RequestParam` extends Obsidian's `RequestUrlParam` (minus `body` and `url`) with a `body` field accepting `string | Binary`. The URL is always the first argument; omitting `params` performs a plain `GET`.
`RequestResponse` is an exported SDK type for the response returned by `Request`.

Set `ignoreCancellation` to `true` to let a request through after the sync has been cancelled. Reserve it for cleanup calls that release remote resources the backend already created, such as aborting an incomplete multipart upload.

## `VaultRequest`

Local vault operation function used by the local filesystem. Modules rarely interact with `VaultRequest` directly, but it is exported for advanced use cases.

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

For the method-to-Obsidian-adapter mapping, see [deep dive: request](../deep-dive/request#vault-request).

`STAT` and `LIST` use cached vault objects by default when the layout is ready. Set `cached` to `false` to bypass those caches and query the vault adapter instead. The option defaults to `true` when omitted.

## Middleware

Request middleware wraps the request function in ascending `priority` order. There are **two separate middleware systems**: remote and local.

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

Returning `undefined` from `apply` declines the entry at that priority. For the built-in middleware (retry, rate limiter, cancellation, custom headers), see [deep dive: request middleware](../deep-dive/request-middleware).

### Registering Middleware

See [registration](./registration#request-middleware).
