# Migration

The word "migration" stands for two unrelated things.

**Remote Migration** is a user-facing operation: the manual transformation of the remote storage layout that a feature requires, such as turning encryption or [asymmetric storage](./asymmetric-storage) on. Sync Engine never performs it automatically, because sync strategies differ per device and a half-applied remote is catastrophic. It is described in the [Remote Migration guide](../usage/remote-migration).

**Migration**, as used here and in the codebase, means the automatic upgrade of data that Sync Engine itself persisted in an older format, like settings in `data.json` and IndexedDB stores. It never touches the remote, and it is never something the user triggers.

**For users: opening Obsidian / updating Sync Engine at least once during the window performs the automatic migration. For those requiring human action, please ensure you have performed before the deadline.**

For implementation simplicity, migrations are ad-hoc and time-bounded:

- Write the minimum code that repairs one specific legacy shape. Each one is a plain function that runs on load and deletes itself when it is no longer needed.
- Detect legacy data by its shape. A migration must be a no-op once it has already run.
- Run at the earliest seam where the data is visible and nothing has consumed it yet.
- Persist the result through `saveSettings`.
- Every migration carries a `// TODO: remove after <date>` comment which means the deadline for deleting the ad-hoc code.

## Ongoing Migrations

### Sync Strategies

- Reason: 3.2.0 update unified sync strategy and inclusion / exclusion rules handling into a single list.
- Window: 2026-09-28 to 2026-11-01
- Scope: all users.
- Operation: `inclusionRules`, `exclusionRules`, and `decider` are merged.
- Human action: automatic, no human action needed.

### S3 `fetchObjectMeta`

- Reason: 3.3.1 metadata handling rework made the toggle obsolete.
- Window: 2026-10-11 to 2026-10-31
- Scope: all S3 users.
- Operation: the stale `fetchObjectMeta` key is deleted on module start.
- Human action: automatic, no human action needed.

### URL Canonicalization

- Reason: the URL discipline enforcement requires endpoints to be stored in RFC 3986 percent-encoded form instead of whatever the user supplied.
- Window: 2026-10-17 to 2026-11-17
- Scope: WebDAV and S3 users whose endpoint contains one or more characters in literal form whose encoded form differs from its literal form, such as `@`.
- Operation: the endpoint and the S3 proxy URL are re-encoded, and the IndexedDB stores keyed by the namespace derived from the changed Fs UID are copied to the new name.
- Human action: automatic, no human action needed.

### Encryption Master Salt

- Reason: the master salt is derived from the Fs UID, which the URL canonicalization changes. Without a workaround, every file already uploaded with encryption would become undecryptable.
- Window: 2026-10-17 to 2027-02-17
- Scope: users with encryption enabled whose S3/WebDAV endpoint was changed by the URL canonicalization (contains one or more characters in literal form whose encoded form differs from its literal form).
- Operation: the pre-migration endpoint is recorded as `legacyEndpoint`, so the master salt keeps being derived from the old Fs UID. This workaround will be removed once the window is complete.
- Human action: the affected user need to re-upload the encrypted remote following the [Remote Migration guide](../usage/remote-migration) before the end of the window, since the salt changes back once the workaround is removed.
