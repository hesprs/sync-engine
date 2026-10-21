# S3 rclone Module

The S3 rclone module adapts the S3 backend for [`rclone serve s3`](https://rclone.org/commands/rclone_serve_s3/), an experimental S3-compatible gateway that rclone exposes over a local or remote file-system backend. It applies automatically when the S3 backend is selected.

## Why It Is Needed

`rclone serve s3` is not a standard S3 implementation. Sync Engine's [S3 module](./s3) assumes spec-compliant S3 behavior, but rclone's S3 gateway diverges in four ways that break syncing:

### Timestamp Format

Sync Engine stores file modification time as milliseconds in the `x-amz-meta-mtime` metadata header (e.g. `1700000123456`). Standard S3 services store this verbatim and return it on read. Rclone interprets the same header value as a Unix timestamp in seconds, so it treats `1700000123456` as a date in the year 53978.

**Fix:** Uploads convert `mtime` from milliseconds to rclone's seconds format: `1700000123456` becomes `1700000123.456`. Missing metadata falls back to the file stat's `mtime`. Downloads use the millisecond-precision modification time from LIST for numeric or missing `mtime` metadata, so rounded or stale GET/HEAD metadata cannot overwrite it. Direct `stat()` calls convert numeric HEAD metadata back to milliseconds.

### Directory Creation

Standard S3 accepts `PUT` with a trailing-slash key to create a zero-byte folder marker. Rclone silently strips the trailing slash and creates a regular zero-byte file with the folder name, not a directory.

**Fix:** The module makes `mkdir()` a no-op. Directories are created implicitly when their child files are uploaded.

### Folder Moves

S3 moves a folder by copying the folder marker object (`CopyObject` with a trailing-slash source key) then deleting the original. Rclone rejects `CopyObject` requests with trailing-slash keys, returning HTTP 400 `InvalidArgument`.

**Fix:** The module skips folder marker moves. The sync plan moves child files individually, so skipping the marker has no effect on data.

### Directory Listings

S3 `ListObjectsV2` returns folder entries as keys ending in `/`. Rclone's S3 gateway returns only file keys — directory entries are absent entirely. Without directory entries, Sync Engine cannot create the folder hierarchy on download.

**Fix:** The module infers parent directories from file keys after each listing. A file at `notes/ideas/today.md` produces a synthetic directory entry for `notes/ideas/`. Inferred entries are deduplicated against existing entries and scoped to the listed directory.

## Asymmetric Storage

[Asymmetric storage](../asymmetric-storage) flattens remote keys and redirects `mkdir()` to `write()`, which accidentally avoids the directory creation, folder move, and listing issues. When it is enabled (the default), the module applies only the timestamp conversion. Directory fixes activate only when asymmetric storage is disabled.

## Encryption

When [encryption](./encryption) is enabled, the encryption wrapper (priority 7919) sits outside the rclone wrapper (priority 500) and encrypts all metadata values — including `mtime` — before the rclone wrapper sees them. The encrypted value is a base64 string, not a number, so timestamp conversion is skipped and the value passes through unchanged. The encryption wrapper decrypts it back to milliseconds on read.

Encryption also encrypts path segments individually, preserving `/` delimiters, so folder detection and parent inference continue to work on encrypted keys.

## Implementation

The module registers a single remote file-system wrapper at priority `500`, between the S3 file system and the [memory control wrapper](../file-system-wrappers#memory-control-wrapper). The wrapper's `apply` function checks that the selected backend is S3 and that the underlying file system's UID starts with `s3~`; otherwise it declines and the original file system is used unchanged.

The wrapper creates a `RcloneFs` that delegates to the original file system, intercepting only the four operations described above. `read()`, `readStream()`, `delete()`, `exists()`, and `getUid()` pass through without modification.
