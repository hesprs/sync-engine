# S3 rclone Module

The S3 rclone module adapts the S3 backend for [`rclone serve s3`](https://rclone.org/commands/rclone_serve_s3/), an experimental S3-compatible gateway that rclone exposes over a local or remote file-system backend. It applies automatically when the S3 backend is selected.

## Why It Is Needed

`rclone serve s3` is not a standard S3 implementation. Sync Engine's [S3 module](./s3) assumes spec-compliant S3 behavior, but rclone's S3 gateway has several differences that affect syncing:

### Timestamp Format

Sync Engine stores file modification time as milliseconds in the `x-amz-meta-mtime` metadata header (e.g. `1700000123456`). Standard S3 services store this verbatim and return it on read. Rclone interprets the same header value as a Unix timestamp in seconds, so it treats `1700000123456` as a date in the year 53978.

**Fix:** Uploads send `x-amz-meta-mtime` in seconds, preserving millisecond precision: `1700000123456` becomes `1700000123.456`. When metadata omits `mtime`, the module uses the source file's modification time.

Downloads use the millisecond timestamp parsed from LIST's `LastModified` as `stat.meta().mtime`, even when HEAD/GET metadata omits the time or contains a different numeric value. The local file system consumes this metadata to restore the file's modification time. Direct HEAD stats still convert numeric metadata from seconds to milliseconds.

### Optional ETag Support

An rclone backend may omit ETags because it does not support them, or may disable ETag calculation to reduce backend computation.

Enable **Ignore rclone ETags** in the S3 settings group for these backends. This optional setting defaults to disabled; leave it disabled when the backend provides consistent ETags. When enabled, the module identifies files using LIST's millisecond modification time and size. File stats and single uploads use the complete file key as the LIST prefix and select the exact matching object. Within each optimization batch, multiple uploads sharing a parent directory wait for their uploads to settle, then share one recursive LIST of that directory; files in other directories are grouped independently. Listings may require multiple requests when paginated. The backend controls whether ETags are calculated. Multipart part ETags remain available to the S3 upload protocol.

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

[Asymmetric storage](../asymmetric-storage) flattens remote keys and redirects `mkdir()` to `write()`, which accidentally avoids the directory creation, folder move, and directory listing issues. Timestamp handling and the ETag setting apply regardless of asymmetric storage. Directory fixes activate only when asymmetric storage is disabled.

## Encryption

When [encryption](./encryption) is enabled, the encryption wrapper (priority 7919) sits outside the rclone wrapper (priority 2500) and encrypts all metadata values — including `mtime` — before the rclone wrapper sees them. The encrypted value is a base64 string, not a number, so timestamp conversion is skipped and the value passes through unchanged. The encryption wrapper decrypts it back to milliseconds on read.

Encryption also encrypts path segments individually, preserving `/` delimiters, so folder detection and parent inference continue to work on encrypted keys.

## Implementation

The module registers a single remote file-system wrapper at priority `2500`, outside the [optimization wrapper](../file-system-wrappers#optimization-wrapper). This releases each upload's memory reservation before it waits for the shared listing, allowing queued uploads to start. It also observes optimization probes to map task keys to prefixed or encrypted remote keys. The wrapper's `apply` function checks that the selected backend is S3 and that the underlying file system's UID starts with `s3~`; otherwise it declines and the original file system is used unchanged.

The wrapper creates a `RcloneFs` that delegates to the original file system, adapting timestamps, file identity, and directory operations as described above. Its `UploadListings` helper coordinates shared listings and maps task keys to remote keys. A remote optimizer at priority `500` prepares upload groups, then lets the existing backend optimizer select and execute the atoms, preserving S3 batch deletion. Task completion and failure events release skipped uploads from their groups; cancellation releases all remaining waits. The setting extends the existing S3 settings group through the SDK's nested setting registration. `readStream()`, `delete()`, `exists()`, and `getUid()` pass through without modification.
