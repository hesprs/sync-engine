# Core Sync Routine

The core sync routine is implemented by `Sync` in `packages/plugin/src/modules/Sync.ts`. It buckets local and remote stats by sync strategy, compares each bucket with the persistent record store, creates a task plan, and executes the plan against the [file system abstraction](./file-system).

## Sync Trigger

The scheduler accepts requests from manual controls, [realtime sync](../usage/settings#realtime-sync), [startup sync](../usage/settings#startup-sync), and [scheduled sync](../usage/settings#scheduled-sync). Trigger names are `manual`, `nonInteractiveManual`, `realtime`, `startup`, and `interval`.

Each trigger name can carry one registered entry with a priority and an options factory. Pending requests wait until the plugin is idle, then flush as one sync: the scheduler reduces the batch's trigger names to the entry with the highest priority, and that entry's `options()` customizes the run. A batch without registered entries falls back to the `unknown` trigger with default options. Every request in the batch receives the same result.

The built-in entries are registered by Bootstrap: `realtime` (priority 1000) swaps in the fast remote lister, which reuses cached `remoteContext20000` stats when [realtime sync fast mode](../usage/settings#realtime-sync-fast-mode) is enabled and the cache has entries, skipping a fresh remote walk; `interval` (2000), `startup` (3000), and `realtime` request local-delete confirmation when [Confirm Deletions During Auto-Sync](../usage/settings#confirm-deletions-during-auto-sync) is enabled; `nonInteractiveManual` (3990) runs with defaults; `manual` (4000) requests task confirmation when [Confirm Operations in Manual Sync](../usage/settings#confirm-operations-in-manual-sync) is enabled. The non-interactive manual command uses a separate trigger so it can skip manual task confirmation.

Realtime events are debounced and filtered before they schedule a request. Changes made while a sync is executing are ignored. A rename schedules a request when either its old or new path is in scope; see [Sync Strategy Rules](../usage/settings#sync-strategy-rules) for the rule configuration.

## Cancellation

Each run creates a cancellation reference. Stop controls, the progress modal, confirmation dialogs, and plugin cleanup dispatch `syncCanceled`. The routine checks the reference between traversal, planning, confirmation, and execution. The [cancellation wrapper](./file-system-wrappers#cancellation-wrapper) and [cancellation request middleware](./request-middleware#cancellation-middleware) enforce it at the filesystem and request layers.

Cancellation does not roll back completed operations. Task errors raised after cancellation are ignored, but execution waits for task promises to settle before reporting `cancelled`.

## Traversal and Strategy Matching

After infrastructure initialization, the routine dispatches `syncInitialized` with the run's `Infras` and the compiled matcher.

The routine compiles the configured strategy rules once, then starts local and remote discovery concurrently. Local traversal calls `localFs.list('/')` with the matcher. Full remote traversal receives a reporter that forwards progress and applies the matcher to each reported path.

The default remote lister performs the full traversal. If the remote root does not exist, it recreates the root, clears records for the local/remote pair, and returns an empty list.

The matcher resolves each path to a strategy name plus an `advance` flag. For files, the strategy alone decides membership. For folders, `advance` controls traversal: a synchronized folder is traversed and its descendants inherit its strategy unless a later catch-all `none` rule shadows it; a folder that is itself not synchronized but could contain content matched by a later rule is traversed as a probe. The reporter maps these results to `include`, `exclude`, or `advance` for the backend's `list()`. Rule syntax and precedence are documented in [Sync Strategy Rules](../usage/settings#sync-strategy-rules).

After discovery, entries over the configured [maximum file size](../usage/settings#max-file-size) are removed, probed content is pruned, and the remaining stats are organized into per-strategy buckets: `Record<string, StatsMap>` for local and remote stats, and `Record<string, RecordStatsMap>` for records.

## Decider

Planning is strategy-driven. `decideTasks` unions the keys of the local, remote, and record buckets, looks up the registered decider for each strategy name, and fails with a `syncStrategyNotInstalled` error when a strategy has no decider. Each decider receives only its own bucket — `localStats`, `remoteStats`, `records`, and a `taskFactory` — and its tasks are concatenated into the run's task plan. `none` is not a decider; entries resolved to `none` are already dropped before planning.

The built-in strategies are registered by Bootstrap and are selectable in [Sync Strategy](../usage/settings#sync-strategy) rules:

**Bidirectional sync strategy**:

For files, it compares current stats with recorded local and remote UIDs. It creates upload, download, local removal, remote removal, record, or conflict tasks according to which side exists and changed. When both sides exist without a record, equal-size files only create a record; unequal-size files become conflicts. Missing entries on both sides produce record-removal tasks.

Folders produce directory creation, removal, or record tasks. A local/remote file-folder mismatch replaces the changed side when it can be determined; an unresolvable mismatch fails planning.

**Mirror local / Mirror remote sync strategy**:

These two deciders make one side authoritative. They copy authoritative files, create authoritative folders, remove entries present only on the other side, and replace file-folder mismatches. A matching record avoids a redundant file transfer. Unrecorded files with matching keys and sizes receive a record; other unrecorded files are copied from the authoritative side.

## Move Detection

Move detection runs after the decider unless the run disables it. It pairs a delete task with a create task on the same side when their recorded/current file UIDs match, then replaces the pair with `moveLocal` or `moveRemote`.

It repeatedly looks for folder delete/create pairs. A folder pair is converted only when every relevant child has a compatible move into one destination and keeps its basename. New files without recorded identity, incomplete child plans, and ambiguous destinations remain ordinary delete/create operations.

## Confirmations

Two confirmation gates run after move detection and before task execution. Manual task confirmation is requested by the `manual` trigger entry when [Confirm Operations in Manual Sync](../usage/settings#confirm-operations-in-manual-sync) is enabled. Add-record and remove-record tasks are omitted from the displayed list; canceling the dialog cancels the run.

Automatic local-delete confirmation is requested by the `realtime`, `interval`, and `startup` trigger entries when [Confirm Deletions During Auto-Sync](../usage/settings#confirm-deletions-during-auto-sync) is enabled. The dialog contains `removeLocal` tasks. Re-upload choices become upload or remote-directory creation tasks.

Both confirmation mounts a [file tree](./file-tree) component in the progress modal.

## Conflict Resolver

Conflict tasks pass `key`, local and remote file stats, both file systems, and the record store to the selected resolver. Resolvers are registered by modules and selected by [Conflict Resolve Strategy](../usage/settings#conflict-resolve-strategy). Built-in strategies and their user-facing behavior are documented there.
