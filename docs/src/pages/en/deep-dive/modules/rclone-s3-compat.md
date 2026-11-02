# S3 rclone Module

The S3 rclone module preserves file modification times when Sync Engine uses the S3 backend with [`rclone serve s3`](https://rclone.org/commands/rclone_serve_s3/). It applies automatically when the S3 backend is selected.

## Modification Time

Sync Engine stores `mtime` in milliseconds, while rclone interprets `x-amz-meta-mtime` as Unix seconds. The module converts the value at the file-system boundary, in both directions: uploads convert milliseconds to seconds (for example, `1700000123456` to `1700000123.456`), and listings convert seconds back to milliseconds.

Conversion applies only to present, numeric values: non-numeric values pass through unchanged, so encrypted metadata remains intact, and missing `mtime` metadata stays missing on upload. On read, a missing `mtime` is refilled from the listing's own time — `rclone serve s3` keeps object metadata in memory only, so it disappears on server restarts, while the disk modification time it set at upload survives.

## Encryption

When [encryption](./encryption) is enabled, its wrapper (priority 7919) encrypts metadata before the rclone wrapper (priority 500) sees it. The encrypted `mtime` is non-numeric, so this module leaves it unchanged; encryption restores the millisecond value on read.

## Implementation

The module registers a remote file-system wrapper at priority `500`, between the S3 file system and the [memory control wrapper](../file-system-wrappers#memory-control-wrapper). It applies only when S3 is selected and the underlying file-system UID starts with `s3~`.

The wrapper adapts `write()`, `writeStream()`, and `list()` for modification time.
