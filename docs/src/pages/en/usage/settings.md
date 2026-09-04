# Settings

Open **Settings > Sync Engine** to change these options.

Some settings are registered by modules, their usage are documented in module specific pages.

## Core

### Storage Backend

Choose the installed module that connects Sync Engine to your storage service. The connection icon beside the selector checks whether the selected service can be reached, automatically refreshed every 10 seconds, you can also manually trigger a connectivity check by clicking it. Configure the selected service in its module settings when needed. See the [available modules](./modules) for supported backends.

### Module Management

Open the module management page. From there, you can install modules from sources or local files, and update, enable, disable, remove, or edit modules. Modules provide storage backends and extra sync strategies. Review [Security](./security) before installing modules from sources you do not control.

The [module management page](../deep-dive/module-management-page) contains a search bar, an installed-only filter, an install-from-file entry, and module cards. Module source URLs are edited in the **Module sources** page under Development.

### Auto-Update Modules

Automatically update installed modules from their configured sources. Enabled by default. Turn this off when you want to review updates manually.

### Sync Strategy

Choose how Sync Engine decides what to do when local and remote files differ:

- **Bidirectional** is the default. It can apply changes on both sides and asks the selected conflict resolver to handle simultaneous file changes.
- **Mirror local** makes local vault authoritative. It copies local entries to remote and removes remote-only entries.
- **Mirror remote** makes remote storage authoritative. It copies remote entries to local and removes local-only entries.

Mirror strategies overwrite changes on the non-authoritative side without conflict resolution. Other strategies may be supplied by modules.

### Conflict Resolve Strategy

Choose what happens when the same file changed locally and remotely since the last successful sync. Available choices include:

- **Rename and keep both**: keep both versions by renaming the older one to `<original name>.conflict.<extension>`. This is the default and avoids silently losing either version.
- **Latest survives**: keep version with the newer modification time.
- **Keep local**: replace remote version with local version.
- **Keep remote**: replace local version with remote version.
- **Skip**: leave conflict unchanged until you resolve it another way.

Use a strategy that matches how you work. The replace and latest options can discard changes when timestamps are wrong or clocks differ between devices. The optional [Smart Merge module](../deep-dive/modules/smart-merge) adds a text-merge strategy for supported files.

## Features

### Realtime Sync

Automatically start a sync after files change. Enter the delay between the last file change and the sync, for example `500ms` or `5s`. If you edit several files quickly, Sync Engine waits until the delay passes instead of starting a separate sync for every edit.

Disabled by default. The default stored delay is `5s`.

### Startup Sync

Start one sync automatically after the plugin loads. Enter how long to wait after startup, for example `5s` or `1min`.

Disabled by default. The default stored delay is `5s`.

### Scheduled Sync

Start syncs repeatedly at a fixed interval. Enter an interval such as `10min` or `0.5h`. This is useful when you want regular syncs without reacting to every edit.

Disabled by default. The default interval is `15min`. The interval must be greater than zero.

### Realtime Sync Fast Mode

Reuse recently cached remote information during realtime syncs and skip some remote discovery work. This can make quick edits sync faster, especially for large remote folders.

Enabled by default. Turn it off when realtime sync must always perform a full remote check, such as when files are often changed outside Obsidian.

### Asymmetric Storage

Store remote files in a flat layout with generated names instead of mirroring your vault's folders. Sync Engine uses its records to restore the original local paths. This can substantially speed up syncs and reduce work in storage services that handle large folder trees poorly.

This changes how the remote storage looks. Read the separate [Asymmetric Storage guide](../deep-dive/asymmetric-storage) for its design and limitations before enabling it:

- Remote files will not be readable in their normal folder structure.
- Every device using the vault must use the same setting.
- Changing this setting for an existing vault opens a migration prompt. Cancel leaves the current setting unchanged.
- **Toggle without migration** changes the setting without moving remote files or clearing records. Use it only when the remote storage already has the target layout, such as after migrating on another device.
- **Start migration** updates local state, clears matching records, removes known remote entries, and repopulates the remote storage with the new layout. Do not start it concurrently on multiple devices.
- Enable it only when you do not need to browse the remote files as ordinary files.

Enabled by default.

## Controls

These options limit sync resource use. They are useful for storage services with request limits or devices with limited memory.

### Max File Size

Skip files larger than the entered limit. This does not change or delete the file; it is left out of sync operations.

Disabled by default. The default stored limit is `30MB`.

### Max Request Concurrency

Limit how many remote requests can run at the same time. A lower value can help services that reject too many simultaneous requests. A higher value can improve speed when the service and network allow it.

Enabled by default with a limit of `50` requests.

### Min Request Interval

Require a minimum wait between remote requests. Use this when a service enforces a request-per-second limit. This works alongside **Max request concurrency**: one limits simultaneous work, while this one spaces requests out.

Disabled by default. The default stored interval is `0`.

### Max Memory Consumption

Limit memory used while Sync Engine processes files. A lower limit can help on phones or other memory-constrained devices, but may reduce sync throughput.

Enabled by default with a limit of `100MB`.

### Value Formats

- File sizes accept `B`, `KB`, `MB`, `GB`, or `TB`, for example `10MB` or `0.5GB`.
- Time values accept `ms`, `s`, `min`, `h`, or `d`, for example `500ms`, `5s`, or `1h`.
- Numeric values such as request concurrency accept a number, for example `50`.
- Values must be zero or greater. Settings that represent a limit or interval may reject zero. Invalid values remain marked with a warning and are not saved until corrected.

## Inclusion and Exclusion Rules

Use glob rules to control which files and folders Sync Engine synchronizes.

- **Exclusion rules** stop matching files and folders from syncing.
- **Inclusion rules** make exceptions to exclusion rules.
- Files and folders matching neither list sync normally.

Sync Engine evaluates each file and folder against both lists:

1. A matching inclusion rule takes precedence, even when an exclusion rule also matches.
2. An item inside an excluded folder remains excluded unless an inclusion rule matches that item or a descendant that should be kept.
3. An item matching only an exclusion rule does not sync.
4. An item matching neither list syncs.

Example:

```text
Exclusion rule: private/
Inclusion rule: private/keep.md
```

`private/keep.md` syncs; other files under `private/` remain excluded. Add inclusion rules for files or subtrees that should pass through excluded folders.

::: warning

If you sync Obsidian's plugin directory, you need to **exclude Sync Engine's modules folder in any situation (always ensure `.obsidian/plugins/sync-engine/modules` exists in your exclusion rules)**. [Due to security considerations](../deep-dive/extensibility), all untracked modifications in that folder (including sync runs) will trigger Sync Engine's security protection mechanism. And will cause the modules fail to load.

:::

### Writing Rules

Rules use [`glob` expressions](<https://en.wikipedia.org/wiki/Glob_(programming)>):

| Rule              | Matches                                           |
| ----------------- | ------------------------------------------------- |
| `*.log`           | Log files anywhere in your vault                  |
| `temp/`           | Folders named `temp` and their contents           |
| `notes/**/*.md`   | Markdown files inside `notes` and its subfolders  |
| `test-files/**/*` | Everything inside `test-files` and its subfolders |
| `**/.trash/`      | Any folder named `.trash`                         |
| `/.obsidian/`     | `.obsidian` at vault root                         |

`*` matches within one path segment. `**` also crosses subfolders. `?` matches one character. Add `/` at the end to match folders. Rules are case-insensitive by default; use the case-sensitive button in the rule editor when needed. Start a rule with `/` to anchor it at the vault root.

::: tip

Sync Engine avoids walking excluded subtrees. When an excluded folder cannot contain anything matched by an inclusion rule, traversal stops at that folder. If an inclusion rule could match a descendant, Sync Engine probes that folder to find the included content.

Anchor inclusion rules when their location is known. For example, use `/projects/current/**/*` instead of `projects/current/**/*` when `projects` is at the vault root. An anchored rule narrows the possible path immediately, reducing probes through unrelated excluded folders. Unanchored rules can match the same path shape at any depth, so they may require more traversal.

:::

## Miscellaneous

### Custom Headers

Add HTTP headers to every request sent to the remote storage service. Some services use headers for a tenant name, API version, or other account-specific option.

Use a plaintext header for a non-sensitive value. Use a secret header for a token or other private value; secret values are stored in Obsidian's keychain instead of in the normal plugin settings. See [Runtime Permissions](./permissions#obsidian-secret-storage) for when Sync Engine reads these secrets. Header names must be valid and match what your storage service expects. Empty header rows are ignored when saved.

Do not add credentials as plaintext headers when a secret header is available. Incorrect headers can make connection checks and syncs fail. Backend modules may have their own credential settings; follow the module's documentation for those.

### Notice Sync Status on Mobile

Show a notice on mobile while a sync is running. On desktop, the status bar shows this information instead.

Enabled by default.

### Avoid Auto Sync When Offline

Silently skip all non-manual sync runs when your device is not connected to any wired or wireless network.

Enabled by default.

### Confirm Operations in Manual Sync

Show planned file operations before a manually started sync runs. You can review and confirm them. This does not affect automatic syncs.

Enabled by default.

### Confirm Deletions During Auto-Sync

Ask before an automatic sync deletes local files. In the confirmation window, you can accept the deletions or choose to re-upload those files instead.

Enabled by default. This applies to realtime, startup, and scheduled syncs.

## Development

These actions are mainly for troubleshooting. Use them carefully.

### Clear Records

Sync Engine keeps records of which local and remote files were last matched. It uses these records to tell a new change from a conflict and to plan safe sync operations.

Clicking **Clear** button removes records for the current backend + vault combo.

These actions do not directly delete files, but the next sync will have less history and may plan uploads, downloads, or deletions differently. The setting warns that clearing records can cause data loss. Only use it when you manually modified remote files and the plugin already reports wrong operations.

### Export Logs to File

Write Sync Engine's logs to a file in `<vault root>/Sync Engine Logs/` folder. Use this when reporting a failed sync or investigating a connection problem. Logs can contain paths and service details, so review the file before sharing it.

### Module Sources

Edit the URLs Sync Engine uses to obtain the module catalog. URLs must use `http:` or `https:` and invalid entries are marked until corrected; use HTTPS whenever possible.

The default source is `https://sync.consensia.cc/modules.json`. An alternative GitHub-hosted source `https://raw.githubusercontent.com/hesprs/sync-engine/refs/heads/gh-pages/modules-alternative.json` is available for networks that cannot reach the default source. Use one official source at a time to avoid duplicate module entries.
