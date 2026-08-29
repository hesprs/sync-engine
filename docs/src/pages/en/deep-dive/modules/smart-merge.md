# Smart Merge Module

Smart Merge is an optional text conflict resolver for Markdown files. It keeps a base snapshot for each mergeable file, then uses that snapshot to distinguish independent edits from conflicting edits. The module registers a remote file system wrapper, the `smartMerge` conflict resolver, and settings.

## Supported Files and Registration

Only paths that end in `.md` or `.markdown` after trimming and lowercasing are mergeable. Other files are passed through without base-text tracking.

The module wraps the remote file system with priority `20_098`. The wrapper delegates normal file system behavior to the wrapped instance and adds base snapshot maintenance. The resolver is registered under the ID `smartMerge`.

## Base Snapshot Lifecycle

The wrapper receives a `uni-kv` `StoreAsync<string>` for its local/remote file-system namespace. The store maps file keys to plain text snapshots.

- After a successful `write()`, the wrapper stores the written value as text if the path is mergeable. A failed write does not update the snapshot.
- After a successful `move()`, an existing snapshot moves from the old key to the new key. A move to the same key does not change the store.
- After a successful `delete()`, the snapshot for that key is deleted.
- `read()`, `readStream()`, `mkdir()`, `stat()`, `exists()`, and `list()` keep their original behavior.

The database store name is `base-text-<namespace>`, where the namespace is the same namespace selected by plugin core for the local and remote file systems. This prevents snapshots from being shared between unrelated sync targets.

## Conflict Resolution Flow

The resolver receives both `FileStat` values, the file key, both file systems, and the sync record store. It reads local content, remote content, and the stored base snapshot concurrently.

When a base snapshot exists:

1. Decode local and remote content as text.
2. If both texts are identical, do not write either side; only refresh the sync record with the existing UIDs.
3. Otherwise, merge the three texts with local as `a`, remote as `b`, and the stored snapshot as `o`.
4. Write the merged text only to sides whose current text differs from it.
5. Record the resulting local and remote UIDs.

When no base snapshot exists, Smart Merge cannot distinguish independent changes. It falls back to latest-survive behavior: copy the side with the newer modification time to the other side. Local wins only when `local.mtime > remote.mtime`; equal timestamps select the remote side. The fallback uses the SDK transfer helper, so large content can be transferred as a stream.

## Merge Model

The merge algorithm is a recursive diff3 merge. It is text-oriented rather than Markdown-AST-aware and operates at several granularities:

- At document level, it splits content into non-blank lines and preserves the newline runs between them.
- Fenced blocks beginning with triple backticks, `~~~`, or `$$` are split as code and compared line by line. Their opening and closing fences remain part of the merged content.
- Prose is split into words and punctuation while whitespace remains in the joints between tokens. For scripts commonly written without spaces, it uses `Intl.Segmenter` with locale detection for Japanese, Chinese, Thai, Lao, Khmer, Myanmar, and Tibetan text.

For each diff3 region, the algorithm applies these rules:

- If local and remote are equal, keep that value.
- If one side still equals the base, keep the change from the other side.
- If both sides changed the same region differently, emit a conflict.
- If a conflicting region can be split at a finer granularity, recurse before emitting markers. This allows unrelated edits within one line or code block to merge independently.

Whitespace and newline joints are retained from the source spans while regions are combined. The algorithm does not attempt semantic or syntactic validation of the resulting document.

## Conflict Markers

Conflicting content is written directly into the merged file. A normal two-sided conflict is emitted as local content wrapped by the `ours` markers, followed by remote content wrapped by the `theirs` markers. When one side deletes content and the other changes it, the surviving content is wrapped by deletion markers.

The default markers are:

| Purpose           | Start                             | End       |
| ----------------- | --------------------------------- | --------- |
| Local (`ours`)    | `<mark class="conflict ours">`    | `</mark>` |
| Remote (`theirs`) | `<mark class="conflict theirs">`  | `</mark>` |
| Deletion          | `<mark class="conflict deleted">` | `</mark>` |

Users can configure all six marker strings independently in the Smart Merge settings. Changes update module settings and are persisted through the plugin settings store.
