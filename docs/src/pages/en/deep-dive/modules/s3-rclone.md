# S3 rclone

S3 rclone adapts Sync Engine's S3 backend to `rclone serve s3` on Sync Engine 3.3.0 or later. Install and enable both modules, select **S3** as the storage backend, and configure its endpoint, credentials, bucket, URL style, and prefix. This module uses the existing S3 connection, signing, transfers, and batch deletion.

## Object Identity and Queries

The existing **Realtime sync fast mode** setting selects the query for exact file stats and upload confirmation, regardless of the sync trigger:

- Enabled: use HEAD only.
- Disabled: use a prefixed listing and match the exact object key, following pagination when necessary.

Both ordinary and multipart uploads confirm the stored object after completion. A confirmation already obtained by the backend's upload fallback is reused. Upload-response ETags are never saved directly as file identity.

Valid queried ETags take precedence. Without an ETag, HEAD, exact listings, and recursive discovery all use `floor(mtime / 1000) * 1000` plus file size as the UID. This module deliberately uses second precision so switching query modes does not create changes from timestamp precision alone. Without an ETag, modifications within the same second that preserve size may go undetected. This only reconciles timestamp precision; rclone can also return different times, as described in [Rclone HEAD Modification Time](#rclone-head-modification-time).

Stat modification times retain their original query precision; metadata times and download preferences never affect identity or conflict decisions.

[AWS HEAD](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html) supplies an HTTP `Last-Modified` date with second precision; [object listings](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html) supply XML timestamps that can retain milliseconds. The SDK uses milliseconds internally. The [rclone mtime header](https://rclone.org/s3/#modification-times-and-hashes) instead carries Unix seconds with a fractional part. These are distinct representations with explicit conversions.

### Rclone HEAD Modification Time

In rclone 1.75.2, HEAD can return the upload time in `Last-Modified` after an ordinary or multipart upload that supplies `X-Amz-Meta-Mtime`. The actual file mtime is set to the supplied value, and listings return that restored time. For example, a file with a 2023 mtime uploaded in 2026 can appear as 2026 through HEAD and 2023 through a listing.

The server's [HEAD implementation](https://github.com/rclone/rclone/blob/v1.75.2/cmd/serve/s3/backend.go#L313-L320) first reads the file time, then overwrites it with cached upload metadata. [Ordinary and ranged GET](https://github.com/rclone/rclone/blob/v1.75.2/cmd/serve/s3/backend.go#L393-L400) have the same behavior; switching to GET does not correct `Last-Modified`. The `X-Amz-Meta-Mtime` response header can still contain the correct source time. Tests reproduced the mismatch with VFS cache modes `off` and `full`, and with zero write-back and directory-cache durations.

Without a valid ETag, this difference produces different UIDs for HEAD and listing queries, potentially causing redundant synchronization even when file contents are unchanged. Disable **Realtime sync fast mode** to use listing identities consistently. Alternatively, remove `--etag-hash ""` to restore rclone's [default MD5 ETags](https://rclone.org/commands/rclone_serve_s3/#synopsis): matching HEAD and listing ETags keep UIDs consistent, though the incorrect `Last-Modified` header remains.

## File Times and Encryption

Ordinary PUT and multipart initialization receive `X-Amz-Meta-Mtime` before request signing. The value comes from the source file's SDK metadata in milliseconds and is converted to fractional Unix seconds. Parts, completion, copy, and cleanup requests receive no time override. Invalid or missing source times are omitted.

**Prefer metadata modification time on download**, in the **S3 rclone** settings group, is off by default. When enabled, downloads restore valid metadata mtime, falling back to the standard stat time. Ctime follows existing metadata restoration. The preference applies to future downloads and can change without altering discovery stats or UIDs.

Ordinary and ranged GET responses supply metadata during downloads. With S3's **Fetch object metadata** enabled, metadata consumed before download, or absent from a GET response, can trigger a lazy HEAD. Each stat caches that lookup, including failures, within its sync session. When a decorated stat is reused for a later download or moved to another key, its lazy lookup is rebound and its lookup cache reset. Authentication errors propagate. Metadata consumed before a download does not hide values received later.

With encryption enabled, file contents, file and directory names, ctime, and other metadata values follow the existing encryption pipeline. Mtime is the plaintext time-header exception and bypasses metadata decryption. Historical encrypted SDK mtime can still be decoded when the download preference is enabled. No additional metadata encryption setting is introduced.

[Rclone's server limitations](https://rclone.org/commands/rclone_serve_s3/#limitations) explain that mtime becomes the actual file modification time, while other custom metadata is kept in server memory. Ctime and other custom values are therefore best effort and can disappear after restart, eviction, or changes made outside that server. Applying downloaded ctime also depends on the local Obsidian adapter and operating system.

## Directories and Protocol Compatibility

Discovery infers parent directories from object keys, retains explicit directory entries and `CommonPrefixes`, and deduplicates entries across pages. Missing or repeated continuation tokens, malformed listings, out-of-scope keys, invalid file stats, and failed pages abort the traversal; partial discovery is never returned as deletion input.

Ordinary `mkdir()` skips directory-marker PUTs. Child uploads establish parent paths, and ordinary storage does not preserve independent empty directories. Asymmetric storage's physical directory files continue to upload normally. A zero-byte file named `ThisIsAnEmptyFolderInTheS3Bucket` is an ordinary file and is included in discovery.

Multipart initialization accepts both `InitiateMultipartUpload` and the standard `InitiateMultipartUploadResult` root. Standard responses pass through unchanged.

## Session Lifecycle

The backend wrapper runs at priority `500`, below prefix and encryption; the plaintext metadata wrapper runs at `9000`, above encryption and below context caches. Request middleware runs at `4001`, before delegation to S3 signing. Time state binds to the complete transformed object URL, keeping concurrent files independent.

The backend's file `stat()` override also supplies consistent identity to its upload fallbacks. Sync termination and unloading release session state and restore the original method. Enabling the module clears cached remote discovery. Synchronization decisions, retries, cancellation, authentication, and local writes remain in their existing SDK and backend pipelines.
