# OpenList File Metadata

OpenList File Metadata is an optional module that sends local file times on upload and restores server-reported times on download through OpenList's S3 or WebDAV interface. Enable it alongside your existing backend module. It has no additional settings and uses that backend's connection configuration.

Files keep their existing names, paths, and contents. The module creates no remote metadata files and does not change the storage format. It applies to future transfers; enabling it does not repair dates on files that are already synchronized.

## Supported Times

| Interface | Upload                                                           | Download                                                       |
| --------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| S3        | `X-Amz-Meta-Mtime`, Unix seconds with millisecond precision      | Standard listing `LastModified`; creation time is unavailable  |
| WebDAV    | `X-OC-Mtime` and, when known, `X-OC-Ctime`, integer Unix seconds | Read `getlastmodified` and available `creationdate` properties |

Creation time is best effort. OpenList's S3 implementation does not persist the original creation time. WebDAV accepts a creation-time header, but whether it affects the stored file depends on the underlying driver and operating system. A returned creation date may be the server's creation time, not the original file's. Missing or invalid dates are not invented; an existing local creation time is retained when no remote creation time is available, including streamed replacements. Local creation-time restoration also depends on Obsidian's adapter and the operating system.

Folder times are not preserved. OpenList's S3 directory `PUT` handler returns before processing time metadata, and its local driver creates directories without restoring their times. Sending `X-Amz-Meta-Mtime` therefore cannot change a real folder's modification time through this interface. Supporting that requires an OpenList server change; the module does not pretend that the operation succeeded.

The module targets OpenList. Other servers that accept the same headers may work, but are not guaranteed. S3 upload metadata is never used for download times or change detection. Both use the listing's standard `LastModified`, retaining its supplied precision.

## Transfer Behavior

Local discovery carries source times with each file's stats. Uploads associate those times with the exact remote object URL, including the backend endpoint and bucket. Concurrent transfers use separate entries. S3 signing and authentication remain in the backend request pipeline.

- S3 ordinary uploads and multipart initiation carry modification time. Individual parts and cleanup requests do not receive file-time headers.
- WebDAV ordinary uploads carry both available times. Nextcloud-style chunked uploads also carry them on the final `MOVE`; this does not add chunked-upload support to OpenList servers that lack it.
- Ordinary downloads restore times through the vault write request. Streamed downloads restore times after the final append and before moving the temporary file into place. The returned local file UID therefore describes the restored modification time.
- Generated content without source-time metadata, such as a new smart-merge result, uses normal write behavior.
- Failure and cancellation release per-transfer state. Disabling or unloading the module removes its registrations and stops time processing.

The remote filesystem wrapper runs at priority `500`, below memory control, optimization, prefix, encryption, and asymmetric-storage wrappers. It sees the actual backend keys without changing them. The local wrapper also runs at `500`; local request middleware runs at `3001`, and remote request middleware at `4001`. Existing cache wrappers retain the module's additional stat metadata for realtime fast mode.

## OpenList S3 Compatibility

Some OpenList versions return empty listing ETags, transient upload ETags, a multipart initiation root named `InitiateMultipartUpload`, or inconsistent dates between listings and object responses. The module handles these responses through its request and filesystem wrappers:

- Normalize the multipart initiation root to the standard result name.
- Use a valid listing ETag when available; otherwise use the listing's modification time and size. No file content hashes are calculated.
- After uploading, obtain the exact object's identity with a prefixed list request so it matches later discovery. A lookup already performed by the backend's write fallback is reused.

S3 file stats use the same list-based lookup, including backend write fallbacks that would otherwise issue `HEAD`. Streamed downloads use the listed time before starting the local writer. Sync detection requests only the listing pages: no per-file `HEAD`, metadata `GET`, or directory walk is added. All network requests use the existing authentication, cancellation, retry, and rate-limiting pipeline.

## Directory Discovery

The module constructs directories from the returned `Contents.Key` paths. OpenList represents an empty directory with a zero-byte object named `ThisIsAnEmptyFolderInTheS3Bucket` inside it. The module collects that object's parents before removing the virtual file. Explicit directory markers are retained; `CommonPrefixes` are also supported when present, including missing trailing slashes.

Directory processing adds no requests. It deduplicates folder entries across listing pages and rejects missing or repeated continuation tokens. A failed page aborts discovery instead of returning a partial list that could be interpreted as remote deletion. Folder entries still pass through the plugin's sync rules and reporters. Genuine remote deletions remain detectable; no historical folders are retained after their listed content and empty-directory markers disappear.

Each full traversal resets pagination state. Enabling the module clears the in-memory remote discovery cache so realtime fast mode cannot reuse an older file-only list. Persistent sync records remain available. Folder modification times do not participate in directory visibility or deletion decisions.
