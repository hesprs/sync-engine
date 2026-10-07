# WebDAV Module

The WebDAV module registers the `webdav` remote file system. It implements the [unified file-system key schema](../file-system#unified-key-schema) using only Sync Engine's injected [`Request`](../request) abstraction; it has no WebDAV client dependency.

Every request uses HTTP Basic authentication. The module normalizes the endpoint and percent-encodes individual remote path segments before issuing a request.

## Supported Backends

The standard mode can theoretically work with any WebDAV service that supports HTTP(S), Basic authentication, ranged `GET`, `PROPFIND`, `PUT`, `DELETE`, `MOVE`, and `MKCOL`. This includes WebDAV installations based on:

- Nextcloud
- ownCloud
- Apache `mod_dav`
- Microsoft IIS WebDAV
- InfiniCLOUD
- Koofr WebDAV API
- Synology WebDAV Server
- Seafile's WebDAV extension
- SabreDAV
- Nutstore
- AList, OpenList, and Cloudreve's WebDAV compatibility layer

The optional chunked-upload mode requires Nextcloud's upload protocol and is not standard WebDAV. Enable it only for compatible Nextcloud servers.

## Settings

The module registers these settings:

- **Server URL**: HTTP or HTTPS WebDAV endpoint. Invalid URLs and non-HTTP(S) protocols are rejected; trailing slashes are removed when saved.
- **Username**: WebDAV account name, trimmed before saving.
- **Password**: WebDAV account password. Obsidian stores it in its keychain rather than module settings.
- **Base directory**: Remote directory that becomes the vault root. `/` uses the endpoint root. Values are trimmed and normalized with a trailing slash. An empty persisted value defaults to `<vault name>/` when the module is constructed.
- **Use `Depth: infinity`**: Lists a directory tree with one `PROPFIND` request instead of recursively traversing depth-one responses. It can speed remote discovery, but some servers do not support it. It gives no performance benefit with [asymmetric storage](../asymmetric-storage) enabled.
- **Nextcloud-style chunked upload**: Uploads large streamed files through Nextcloud's chunked-upload protocol rather than buffering each whole file in memory. Most WebDAV servers do not support this mode.
- **File metadata**: Stores file metadata (such as creation time) as a JSON-encoded custom property `se:meta` via `PROPPATCH` after upload, and reads it back during `PROPFIND`. Enable only when the server supports `PROPPATCH` with custom dead properties.

## File Operations

`read()` sends `GET` and returns response bytes. `write()` sends `PUT`, returning its `ETag` header when present; otherwise it immediately calls `stat()` and returns the resulting file UID. When file metadata is enabled and the file's `meta` is non-empty, `write()` also sends a `PROPPATCH` request to store the meta as a JSON-encoded `se:meta` custom property. The `PUT` and `PROPPATCH` run concurrently.

`delete()` sends `DELETE` and treats HTTP `404` as already deleted. `move()` sends `MOVE` with a `Destination` header. `mkdir()` sends `MKCOL`; recursive creation creates ancestor directories in order and ignores HTTP `405`, which indicates an existing directory.

`stat()` sends a depth-zero `PROPFIND` for the target, except `/`, which is returned locally as a folder. The request asks for the resource type, modification time, content length, and `ETag`; when file metadata is enabled, it also requests `se:meta`. File UIDs use `ETag` when available, otherwise `<mtime>~<size>`; folders have no UID. `exists()` uses the same lookup and returns `false` for HTTP `404`.

`PROPFIND` response pagination is supported through a `Link: <...>; rel="next"` response header.

## Streaming

`readStream()` uses ranged `GET` requests because [`Request` cannot expose a response stream](../request#limitations). It requests 2 MiB ranges, keeps at most eight requests in flight, buffers at most eight chunks, and emits chunks in source order. New requests are scheduled only while the stream consumer can accept data. A zero-byte file returns a closed stream.

Without chunked upload, `writeStream()` collects the complete input stream in memory, then calls `write()` with the file's stat (including meta).

With Nextcloud-style chunked upload enabled, it:

1. Creates a UUID-named upload collection under Nextcloud's upload endpoint.
2. Splits the input into 5 MiB numbered chunks and uploads at most three concurrently. Each upload includes `Destination` and `OC-Total-Length` headers.
3. Moves the generated `.file` to the destination.
4. Returns `ETag` or `OC-ETag`; when neither is present, it calls `stat()` for the file UID. When file metadata is enabled, a `PROPPATCH` is sent after the `MOVE` to store `se:meta`.

On failure, the module waits for active uploads and deletes the temporary upload collection.

## Base Directory Wrapper

WebDAV uses the shared importable [`prefixWrapper`](../../development/file-system#prefixwrapper) to expose its configured base directory as the file-system root. See [file-system wrappers](../file-system-wrappers) for wrapper-chain details.
