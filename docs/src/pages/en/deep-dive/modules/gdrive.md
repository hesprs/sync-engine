# Google Drive Module

The Google Drive module connects Sync Engine to Google Drive. It registers the `gdrive` remote file system, authenticates with OAuth through Google's device flow, and stores the vault as regular files and folders that stay readable in the Drive web and mobile apps.

## Requirements

The module uses a Google Cloud OAuth client that you create in your own Google account, so no third-party server ever handles your tokens:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (or reuse one) and enable the **Google Drive API**.
2. Configure the OAuth consent screen. Add yourself as a test user, or publish the app to production — a consent screen left in testing mode expires refresh tokens after seven days, forcing weekly reconnects.
3. Create an OAuth client of type **TV and Limited Input devices** and note the client ID and client secret.

The same client ID and secret are entered on every device that syncs; each device completes its own device-flow approval.

## Settings and Configuration

Install and enable the Google Drive module, then select **Google Drive** as the storage backend. Configure these module settings:

| Setting                 | Description                                                                   |
| ----------------------- | ----------------------------------------------------------------------------- |
| **OAuth client ID**     | Client ID of your Google Cloud OAuth client.                                  |
| **OAuth client secret** | Client secret of the same OAuth client. Stored in Obsidian's keychain.        |
| **Google account**      | Connect, reconnect, or disconnect the Google account through the device flow. |
| **Base directory**      | Drive folder that holds the vault. Defaults to the vault name.                |
| **Delete to trash**     | Move remote deletions to the Drive trash instead of deleting permanently.     |

Connecting opens a dialog with a short code: visit the shown Google URL on any device, enter the code, and approve access. The dialog polls until Google confirms, then the module stores the refresh token and shows the connected account.

## Credentials and Keychain

The client secret and the refresh token are stored through Obsidian's secret storage, not as ordinary module settings. Access tokens are short-lived, kept only in memory, and refreshed automatically. Disconnecting clears the stored refresh token; access can also be revoked at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## Scope and Visibility

The module requests only the `drive.file` scope, plus `email` to display the connected account. `drive.file` grants access exclusively to files this module created — it cannot read the rest of the Drive. The practical consequences:

- Do not create the base directory manually in Drive; the module creates it on the first sync. A manually created folder is invisible to the module and leads to a duplicate.
- Files added to the vault folder through the Drive web or mobile apps are invisible to the module and never sync. Edit through Obsidian only; treat the Drive copy as read-only.
- Google shows an "unverified app" style consent step for personal OAuth clients. That is expected — the client is your own.

## Base Directory

The base directory is resolved to a Drive folder ID and used as the file-system root, so the folder path never appears in keys. It must be identical on every device syncing the same vault. Renaming or moving the vault folder in the Drive web interface changes nothing for sync (IDs stay stable) as long as the configured path still resolves; keep the setting and the actual folder in agreement.

## Practical Behavior

- Folders are real Drive folders and moves use Drive's native rename and re-parenting — no copy-and-delete.
- Deleting a missing file is treated as success. With **Delete to trash** enabled, deletions land in the Drive trash, which Google empties after 30 days.
- File UIDs use the Drive `md5Checksum`. The local modification time is written to Drive's `modifiedTime` on upload, so timestamps survive round trips between devices.
- Duplicate names in one folder (possible in Drive, not in a vault) resolve to the most recently modified file.
- [Asymmetric storage](../asymmetric-storage) can flatten and anchor remote keys. Use it only when remote files do not need to remain readable in their normal folder structure, and keep the setting consistent across devices.

## Implementation

### Unified File-System Mapping

`GdriveFs` implements the SDK `RootFs` contract with unified keys. Drive is ID-based, so the module resolves path keys to file IDs segment by segment and caches the mapping for the lifetime of the instance. The basic operations map to Drive API v3 requests as follows:

| File-system operation | Drive operation                                  |
| --------------------- | ------------------------------------------------ |
| `read()`              | `files.get` with `alt=media`                     |
| `write()`             | Multipart upload (create or update)              |
| `stat()`              | `files.list` lookup by parent and name           |
| `delete()`            | `files.update` with `trashed`, or `files.delete` |
| `move()`              | `files.update` with `addParents`/`removeParents` |
| `mkdir()`             | `files.create` with the folder MIME type         |
| `list()`              | Paginated `files.list`, assembled into a tree    |

### Bearer Middleware

When Google Drive is the selected backend, registered request middleware attaches a `Bearer` access token to every remote request. A shared token manager caches the access token, refreshes it through the stored refresh token shortly before expiry, deduplicates concurrent refreshes, and retries a request once after an authentication failure. A revoked refresh token surfaces as a clear reconnect prompt.

### Flat Listing

Because `drive.file` limits visibility to module-created files, `list()` fetches every visible file in one paginated query (1000 files per page) instead of one request per folder, then assembles the tree client-side from parent references. The walk honors the unified reporter verdicts, skipping excluded subtrees without visiting them.

### Range Reads

`readStream()` downloads media with ranged `GET` requests: 2 MiB chunks, at most eight in flight, emitted in file order. Empty files return an already-closed stream.

### Resumable Uploads

`writeStream()` buffers small files and sends them as one multipart upload. Files of 8 MiB or more use a Drive resumable upload session: metadata initiates the session, sequential `PUT` requests send 8 MiB chunks (Drive requires multiples of 256 KiB), and the final chunk closes the session. On failure the module attempts to cancel the session.
