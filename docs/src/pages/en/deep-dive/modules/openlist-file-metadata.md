# OpenList File Metadata

OpenList File Metadata is an optional module for OpenList's S3 or WebDAV interface on Sync Engine 3.3.0 or later. Enable it alongside the existing backend module. It uses that backend's connection configuration and supports encrypted and unencrypted vaults.

The OpenList server applies upload times through its storage driver. Sync Engine supplies ordinary S3/WebDAV operations, synchronization, metadata encoding, and the local writer. This module supplies OpenList's time headers and protocol compatibility. Files retain their names, paths, and contents; no metadata files are created.

## Settings

**Prefer metadata modification time on download**, in the **OpenList File Metadata** section, is off by default. Enable it to restore downloaded files with a valid metadata mtime when available, falling back to the standard server modification time when metadata is missing or invalid. Creation-time handling is unchanged. The setting applies to future downloads; it does not rewrite dates on already synchronized files.

This preference only changes the time supplied to the local writer. Discovery, file UIDs, change detection, and conflict decisions continue to use standard stats. It does not add HEAD requests or change the backend's **Fetch object metadata** setting.

Plaintext S3 mtime headers use Unix seconds, including fractional seconds. WebDAV and decrypted SDK metadata use Unix milliseconds. Zoned ISO timestamps are also accepted. Numeric units follow their source and are not inferred from the value's magnitude; metadata in another numeric unit is outside this contract.

## Supported Times

| Interface | Upload                                                                                                                  | Download                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| S3        | `X-Amz-Meta-Mtime`, Unix seconds with millisecond precision; ctime follows native `x-amz-meta-ctime` metadata           | Standard listing `LastModified`; valid ctime from downloaded object metadata |
| WebDAV    | `X-OC-Mtime` and, when available, `X-OC-Ctime`, integer Unix seconds; ctime also follows native metadata when supported | Standard `getlastmodified`; valid native ctime or available `creationdate`   |

Upload times come from the source file's plaintext SDK `meta()` fields in milliseconds. Modification time travels through a private stat field across path and metadata transformations, then enters OpenList's time header. Creation time remains in native metadata and follows its normal encoding, including encryption. WebDAV's creation-time header also carries the plaintext time. Missing or invalid times are omitted; generated content without source-time metadata uses normal write behavior.

Download modification time defaults to the standard file stat. The preference above can instead restore metadata mtime. S3 file stats themselves always use listing values to retain their supplied precision, and custom metadata never participates in change detection. Other metadata follows the transferred file and the plugin's sync decisions; this module does not merge metadata or choose a conflict policy.

OpenList's [local driver](https://github.com/OpenListTeam/OpenList/blob/main/drivers/local/driver.go) sets the uploaded file's modification time. Preservation on other drivers depends on their capabilities. Its [S3 server implementation](https://github.com/OpenListTeam/OpenList/blob/main/server/s3/backend.go) caches uploaded metadata in server memory and returns it through HEAD and GET; that cache is not durable across server restarts. Creation time is therefore best effort, and a WebDAV `creationdate` may describe server-side creation rather than the original local file.

Folder times are not preserved. OpenList's S3 directory upload returns before applying file times, and real directory timestamps depend on the server and storage driver. Asymmetric storage's folder representations remain ordinary physical files in the wrapper pipeline.

## Download Metadata and Local Writes

Discovery leaves metadata lazy. Ordinary and ranged S3 GET responses supply `x-amz-meta-*` values during download without additional requests. These values enter below metadata decryption. Plaintext mtime headers are parsed separately and removed from the decryption input; with the preference enabled, historical encrypted SDK mtime follows normal metadata decryption. Authentication or other metadata lookup failures still propagate. After decoding, the module selects the download mtime and exposes valid ctime to Sync Engine's local writer. Consuming metadata before download does not hide metadata received later.

The backend's **Fetch object metadata** setting still permits a lazy HEAD when metadata is consumed before download or the download response supplies no metadata. Each stat caches that lookup, including failures, so streamed writes do not repeat HEAD per chunk. An empty ranged download makes no GET and cannot supply additional metadata. WebDAV requests `creationdate` within its existing PROPFIND and prefers valid native ctime when both are available.

The common `VaultFs` consumes these times through write options for buffered and streamed downloads. Applying creation time depends on Obsidian's adapter and the operating system. The module does not intercept local requests or add local timestamp repair operations; temporary files, existing local ctime, write failures, and returned local UIDs belong to the common writer.

## OpenList S3 Compatibility

Some OpenList responses contain transient upload ETags, empty listing ETags, or a multipart initiation root named `InitiateMultipartUpload`. Generic handling of unusable ETags remains in Sync Engine's S3 backend. This module normalizes OpenList's multipart root and obtains file stats from exact-key, prefixed listing queries.

After upload, one exact-object lookup supplies the UID used by subsequent discovery. A lookup already performed by the backend's upload fallback is reused. The backend instance's file `stat()` is scoped to this listing lookup so internal write fallbacks also use it; the original method is restored when the session ends. Valid listing ETags are retained, otherwise identity uses listing modification time and size. No content hashes are calculated.

Upload times bind to the complete object URL, including endpoint, bucket, and transformed path. S3 ordinary uploads and multipart initiation receive the time header; parts, completion, copy, and cleanup requests do not. WebDAV ordinary uploads and the final MOVE of a Nextcloud-style chunked upload receive time headers. This does not add Nextcloud upload support to OpenList servers that lack it.

## Directory Discovery

The module infers parent directories from S3 `Contents.Key` paths without directory walks. OpenList's zero-byte `ThisIsAnEmptyFolderInTheS3Bucket` placeholder contributes its parent directories and is then hidden. A nonempty file with that name remains a file. Explicit directory markers and `CommonPrefixes` are retained, folders are deduplicated across pages, and the queried root is excluded.

Missing or repeated continuation tokens, invalid listing roots, out-of-scope keys, and failed pages abort discovery. A partial list must never become deletion input. Every full traversal resets pagination state, and enabling the module clears cached remote discovery. Genuine deleted folders remain detectable; historical folders are not retained.

## Responsibility Boundary

The backend compatibility wrapper runs at priority `500`, below prefix and encryption. The plaintext metadata wrapper runs at `9000`, above encryption and below context caches. Remote request middleware runs at `4001`, before delegation into the existing authentication pipeline. Concurrent transfers use independent object state; failures, sync termination, and unloading release session state and scoped overrides.

OpenList-specific directory and multipart handling, listing-based identities, and time-header conversion belong to this module. Generic ETag parsing, authentication, proxy routing, retries, cancellation, synchronization decisions, metadata encoding, and local writing belong to Sync Engine and its backend implementations. The module uses their existing request pipeline and propagates errors. Enabling it affects future transfers and discovery; it does not rewrite already synchronized file dates.
