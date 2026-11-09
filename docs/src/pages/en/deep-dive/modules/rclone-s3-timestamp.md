# Rclone S3 Timestamp Module

This module preserves file modification times when Sync Engine uses the S3 backend with [`rclone serve s3`](https://rclone.org/commands/rclone_serve_s3/). It applies automatically when the S3 backend is selected.

## Modification Time

Sync Engine stores `mtime` in milliseconds, while rclone interprets `x-amz-meta-mtime` as Unix seconds. The module converts the header on the wire, in both directions: uploads convert milliseconds to seconds (for example, `1700000123456` to `1700000123.456`), and downloads convert seconds back to milliseconds.

Conversion applies only to parsable values: uploads convert only values shaped like Sync Engine timestamps (13-digit milliseconds); downloads convert only numeric values. When `rclone serve s3` loses its in-memory metadata after a server restart and omits `x-amz-meta-mtime`, the S3 backend recovers the time from `Last-Modified` on its own.

## Encryption

When [encryption](./encryption) is enabled, its wrapper (priority 7919) encrypts metadata before the S3 backend turns it into `x-amz-meta-*` headers. The encrypted `mtime` is non-numeric, so this module leaves it unchanged; encryption restores the millisecond value on read.

## Implementation

The module registers a remote request middleware at priority `307`, outside the S3 SigV4 middleware (`304`) so request signatures cover the converted value, and inside the retry middleware (`2000`) so every attempt converts from the original parameters. The middleware rebuilds requests and responses instead of mutating them, leaving every other header untouched.
