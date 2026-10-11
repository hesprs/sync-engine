# S3 rclone

Optional adapter for `rclone serve s3`. Enable it alongside the S3 backend on Sync Engine 3.3.0 or later. The module specification is in `docs/src/pages/en/deep-dive/modules/s3-rclone.md`.

Run scripts directly from this package to avoid rebuilding SDK declarations:

```sh
bun fix
bun check
bun tests
bun compile
```

For live verification, supply `S3_RCLONE_ACCESS_KEY_ID` and `S3_RCLONE_SECRET_ACCESS_KEY` through the environment and run `bun tests:live`. It targets `http://127.0.0.1:23801`, bucket `test-files`, and uses a unique prefix. It checks plain and encrypted transfers, pagination, query modes, timestamp preferences, empty files, directory behavior, a 6 MiB multipart upload, moves, batch deletion, cancellation, and session cleanup. Temporary local files and remote objects are removed on completion.

The script reports HEAD/listing identity mismatches and exits unsuccessfully if any occur. The local service tested during implementation returned upload time in HEAD and restored mtime in listings without an ETag. Disable realtime sync fast mode on servers with this behavior.
