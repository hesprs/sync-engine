# File System Abstraction

The plugin abstracts the file system interfaces into unified file system class `RootFs` as defined in `packages/plugin/src/fs/interface.ts`. All abstractions are designed to be immutable and throw-away in each sync run.

Different types of [wrappers](./file-system-wrappers) can be applied above the unified interface. Their existence allows easy extensibility of file system functions. Raw FS classes should not carry any additional functions, such as base dir config or retry, they should all be achieved via wrappers.

## Vault Abstraction

Vault file system consumes [`VaultRequest`](./request#vault-request), a typed operation function abstracting Obsidian vault APIs.

`constructor()`: receives a `VaultRequest` and the vault name.

`getUid()`: returns `obsidian-vault~<vault-name>`.

`read()`: delegates to `VaultRequest` `GET`, which wraps `vault.adapter.readBinary()` and converts the result to `Binary`.

`readStream()`: delegates to `GET_STREAM`, which fetches `vault.adapter.getResourcePath(path)` and returns the response body. It throws if no response body is available.

`write()`: delegates to `PUT`, then calls `this.stat()` and returns the file UID.

`writeStream()`:

- creates `.trash/<random-UUID>.part`, creating `.trash` when needed
- reads the input stream and appends each chunk with `APPEND`
- removes an existing destination, then moves the temporary file into place
- calls `this.stat()` and returns the file UID
- on failure, cancels the input stream and permanently removes the temporary file

`delete()`: delegates to `DELETE`. Permanent deletes and `vault.config.trashOption: "none"` call `vault.adapter.remove()`. `"local"` calls `trashLocal()` directly; `"system"` or an unset option tries `trashSystem()` and falls back to `trashLocal()` when needed.

`move()`: delegates to `MOVE`, wrapping `vault.adapter.rename()` after normalizing the destination path.

`mkdir()`: delegates to `MKDIR`, wrapping `vault.adapter.mkdir()`. Creating the root is a no-op.

`stat()`:

- delegates to `STAT`
- uses cached `TFile`/`TFolder` metadata when `workspace.layoutReady`; otherwise falls back to `vault.adapter.stat()`
- converts file results to the project `Stat` format, with `uid` as `mtime` + `size` separated by `~`; folders have no UID

`list()`: recursively traverses descendants with concurrent requests. `LIST` uses cached folder children when the layout is ready, otherwise `vault.adapter.list()`. Each file is then passed through `stat()`, while folder entries are returned directly. The queried root is excluded from the result.

`exists()`: checks `vault.getAbstractFileByPath()` first, then falls back to `vault.adapter.exists(path, true)`.

## Unified Key Schema

All abstracted file systems should automatically convert between the unified key and their native file path:

- `/` is the root.
- Files have no trailing slash.
- Folders have a trailing slash.
- Non-root paths do not have leading slash

For example:

- root: `/`
- `file.md`, `folder/file.md` stand for files.
- `folder/`, `folder/folder/` stand for folders.

## Optimizer

During execution, local and remote file systems use optimization wrappers. They batch mutation calls and invoke the first registered optimizer; batching, companion reads, and dependency handling are documented in the [optimization wrapper](./file-system-wrappers#optimization-wrapper).

The routine sorts tasks into file removals, directory creation, moves, directory removals, and remaining operations. It then executes the optimized task list concurrently. The run reports `completed`, `failed`, `cancelled`, or `noop`.
