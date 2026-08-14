# Core Sync Routine

The core sync routine is implemented by `Sync` in `packages/plugin/src/modules/Sync.ts`. It compares filtered local and remote stats with the persistent record store, creates a task plan, and executes the plan against the [file system abstraction](./file-system).

## Sync Trigger

The scheduler accepts requests from manual controls, [realtime sync](../usage/settings#realtime-sync), [startup sync](../usage/settings#startup-sync), [scheduled sync](../usage/settings#scheduled-sync), and migration. Trigger names are `manual`, `nonInteractiveManual`, `realtime`, `startup`, `interval`, and `migration`.

Realtime events are debounced and filtered before they schedule a request. Changes made while a sync is executing are ignored. A rename schedules a request when either its old or new path is in scope; see [inclusion and exclusion rules](../usage/settings#inclusion-and-exclusion-rules) for the rule configuration.

Pending requests wait until the plugin is idle, then flush as one sync. The last request supplies the trigger, and every request in the batch receives the same result. The non-interactive manual command uses a separate trigger so it can skip manual task confirmation.

## Cancellation

Each run creates a cancellation reference. Stop controls, the progress modal, confirmation dialogs, and plugin cleanup dispatch `syncCanceled`. The routine checks the reference between traversal, planning, confirmation, and execution. The [cancellation wrapper](./file-system-wrappers#cancellation-wrapper) and [cancellation request middleware](./request-middleware#cancellation-middleware) enforce it at the filesystem and request layers.

Cancellation does not roll back completed operations. Task errors raised after cancellation are ignored, but execution waits for task promises to settle before reporting `cancelled`.

## Traversal and Glob Matching

The routine compiles the configured matcher once, then starts local and remote discovery concurrently. Local traversal calls `localFs.list('/')` with the matcher. Full remote traversal receives a reporter that forwards progress and applies the matcher to each reported path.

The matcher returns `include`, `exclude`, or `advance`. Files are included or excluded; `advance` continues through a directory without including the directory itself. An excluded directory is advanced only when an inclusion rule could match a descendant. Rule syntax and matching precedence are documented in [Inclusion and Exclusion Rules](../usage/settings#inclusion-and-exclusion-rules).

After discovery, `postTraversal` removes entries over the configured [maximum file size](../usage/settings#max-file-size) and converts the lists into stats maps.

## Remote Lister

Remote listing is an extension point. The registrar selects the first registered `RemoteLister` by priority. It receives the local and remote file systems, record store, trigger, and traversal reporter.

The built-in realtime fast lister uses cached `remoteContext20000` stats when [realtime sync fast mode](../usage/settings#realtime-sync-fast-mode) is enabled and the cache has entries. It applies the traversal reporter to cached entries but skips a fresh remote walk. Otherwise, the full lister calls `remoteFs.list('/')`.

If the remote root does not exist, the full lister recreates it, clears records for the local/remote pair, and returns an empty list.

## Decider

The selected decider receives filtered local stats, filtered remote stats, persistent records, a task factory, and a logger. Built-in deciders union all keys found in either side or in the records. The selected [sync strategy](../usage/settings#sync-strategy) can be supplied by a module.

**Bidirectional sync strategy**:

For files, it compares current stats with recorded local and remote UIDs. It creates upload, download, local removal, remote removal, record, or conflict tasks according to which side exists and changed. When both sides exist without a record, equal-size files only create a record; unequal-size files become conflicts. Missing entries on both sides produce record-removal tasks.

Folders produce directory creation, removal, or record tasks. A local/remote file-folder mismatch replaces the changed side when it can be determined; an unresolvable mismatch fails planning.

**Mirror local / Mirror remote sync strategy**:

These two deciders make one side authoritative. They copy authoritative files, create authoritative folders, remove entries present only on the other side, and replace file-folder mismatches. A matching record avoids a redundant file transfer. Unrecorded files with matching keys and sizes receive a record; other unrecorded files are copied from the authoritative side.

## Move Detection

Move detection runs after the decider. It pairs a delete task with a create task on the same side when their recorded/current file UIDs match, then replaces the pair with `moveLocal` or `moveRemote`.

It repeatedly looks for folder delete/create pairs. A folder pair is converted only when every relevant child has a compatible move into one destination and keeps its basename. New files without recorded identity, incomplete child plans, and ambiguous destinations remain ordinary delete/create operations.

## Confirmations

Two confirmation gates run after move detection and before task execution. Manual task confirmation applies only to the `manual` trigger when [Confirm Operations in Manual Sync](../usage/settings#confirm-operations-in-manual-sync) is enabled. Add-record and remove-record tasks are omitted from the displayed list; canceling the dialog cancels the run.

Automatic local-delete confirmation applies when [Confirm Deletions During Auto-Sync](../usage/settings#confirm-deletions-during-auto-sync) is enabled and the trigger is `scheduled`, `startup`, or `realtime`. The dialog contains `removeLocal` tasks. Re-upload choices become upload or remote-directory creation tasks.

Both confirmation mounts a [file tree](./file-tree) component in the progress modal.

## Conflict Resolver

Conflict tasks pass `key`, local and remote file stats, both file systems, and the record store to the selected resolver. Resolvers are registered by modules and selected by [Conflict Resolve Strategy](../usage/settings#conflict-resolve-strategy). Built-in strategies and their user-facing behavior are documented there.
