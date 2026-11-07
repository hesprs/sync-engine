# Dropbox Module

The Dropbox module registers the `dropbox` remote file system. It stores the vault inside the app folder of a Dropbox app and performs file operations through the Dropbox public API. The module uses Dropbox OAuth 2.0 with PKCE for authentication and does not use a third-party server or proxy.

## Settings

The module adds a **Dropbox** settings group. Configure these settings before selecting Dropbox as the remote file system:

### Connect account / Account connected

This setting initiates the Dropbox authorization process. Once authorized, the module stores the refresh token securely in Obsidian's secret storage and uses it to obtain short-lived access tokens as needed. The **Disconnect** option revokes the token set with Dropbox, removes it from secret storage, clears any cached access tokens, and deletes the stored account identifier.

::: warning

Connecting to a Dropbox account creates a **new secret in Obsidian keychain** named `sync-engine-dropbox-refresh-token`. This secret is managed exclusively by Sync Engine and used as the refresh token to trade Dropbox access tokens. Please do not use this secret for other purposes.

:::

### Base directory

This defines the folder inside the Dropbox app folder that serves as the root directory for this vault. The value is normalized as a directory path. If left empty, it stays at `/`, the root of the app folder. The specified folder is created automatically during the first synchronization.

::: warning

The base directory lives inside the app folder, which is an application-managed namespace (shown as `Applications/<app name>` in the Dropbox web interface). The module can see and operate only on files inside its own app folder. Files or folders outside the app folder are not visible to this module.

:::

### Delete to trash

When enabled, files deleted remotely are moved to the Dropbox trash instead of being permanently removed. When disabled, deleted files are permanently erased immediately. Note that Dropbox typically clears items from the trash after 30 days.

## Authentication Flow

The module uses the OAuth 2.0 authorization code flow with PKCE (S256) and a custom `obsidian://` redirect, which Dropbox supports on both desktop and mobile:

1. When you click **Connect**, the module generates a code verifier and its S256 challenge together with a random state value, then shows a dialog with an **Open Dropbox** button.
2. The button opens Dropbox's authorization page in your system browser. The page requests offline access plus exactly the scopes listed below. Approve the access there.
3. Dropbox redirects to `obsidian://sync-engine-dropbox-auth?code=...&state=...`, which re-opens Obsidian and hands the callback to the module. The module verifies the `state` value matches the pending request, then exchanges the authorization code together with the PKCE verifier at Dropbox's token endpoint.
4. Dropbox returns a short-lived access token, a refresh token, and the account id. The module stores the refresh token in Obsidian's secret storage and caches the access token in memory.
5. Later Dropbox requests use the cached access token. When it is close to expiry, the module exchanges the refresh token for a new access token. A failed request with HTTP 401 causes one forced refresh and retry.

No client secret is involved at any point: PKCE replaces it, which is the recommended pattern for public clients such as Obsidian. The `state` value guards against stale or mismatched callbacks, so a leftover redirect from another vault window is ignored.

## Permissions And Scopes

The module's Dropbox app uses the **App folder** permission type and requests exactly these OAuth scopes:

### `files.metadata.read`

Lets the module list its files and read their metadata so it can discover remote changes, check the connection, and resolve paths.

### `files.content.read`

Lets the module download file contents from its app folder.

### `files.content.write`

Lets the module upload file contents, create folders, and delete, move, or rename files inside its app folder.

The **App folder** permission is a deliberate least-privilege choice: the module can manage only the data it created inside its own app folder. The rest of your Dropbox, including files you share or store outside the app folder, is never visible to the module, and the module has no account-wide access.

## File Metadata

Dropbox has no custom key-value metadata for app folder apps (the file properties API explicitly excludes them), so the module stores what the API itself carries:

- File modification times are preserved through `client_modified` on upload and read back through `stat()` and `list()`. The API stores timestamps with second precision.
- File creation times and all folder timestamps are not preserved by the Dropbox API; they fall back to the time the file is created locally when restored to a device.
- File identity uses Dropbox's `content_hash`, the content-derived hash returned by the API.

### Case Sensitivity

Dropbox paths are case-insensitive but case-preserving. Two local files that differ only by letter case cannot coexist in the app folder; the module cannot make them distinct on the remote side, so vaults with case-duplicate names are not supported on this backend. Case-only renames are performed through a temporary intermediate name because Dropbox move endpoints reject them directly.

## Batched Operations

The module ships its own remote optimizer that replaces the plugin's hierarchical optimizer for Dropbox. It keeps the hierarchical semantics (ancestor ordering, umbrella subsumption, move gating) and additionally collapses eligible deletions, moves, and folder creations into the corresponding Dropbox batch endpoints (`delete_batch`, `move_batch_v2`, `create_folder_batch`) instead of issuing one request per file. Batch jobs that Dropbox answers asynchronously are polled until completion, and a per-entry failure rejects only the task it belongs to. Moves that would collide inside one batch call, and case-only renames, are performed individually.

Downloads and uploads are not batched: `write()` uses a single upload request, `writeStream()` uses a concurrent upload session with 4 parallel 4 MiB-aligned appends, and downloads stream through aligned HTTP range requests.

## Privacy Policy

Last updated on **November 3, 2026**.

### Introduction

This Privacy Policy describes how the Sync Engine plugin for Obsidian with Dropbox module ("the Plugin") handles your data when you connect a Dropbox account. The Plugin is open-source software licensed under the MIT License.

### Data We Collect

**We collect no data.** The Plugin has no telemetry, no analytics, no remote logging service, and no backend server. No information about you, your files, or your usage ever leaves your local device.

### How Your Data Is Handled

**Dropbox Account Connection**:

When you click "Connect", the Plugin opens Dropbox's authorization page directly from your device. The Plugin requests only these scopes, restricted to its own app folder:

- `files.metadata.read`: Read file and folder metadata inside the app folder
- `files.content.read`: Download file contents from the app folder
- `files.content.write`: Upload, create, move, and delete files inside the app folder

The rest of your Dropbox is never visible to the Plugin.

**Token Storage**:

OAuth refresh tokens are stored exclusively in Obsidian’s encrypted secret storage on your local device. Tokens are never transmitted to any third party, never logged, and never included in crash reports or diagnostics.

**File Operations**:

All sync operations are triggered or scheduled manually by you. File reads and writes occur directly between your local Obsidian vault and Dropbox via Dropbox’s API. No intermediary servers are involved.

**Data Retention**:

Your data exists only on your local device and in your own Dropbox account. When you click "Disconnect", the Plugin:

1.  Revokes the OAuth token set with Dropbox
2.  Deletes all stored tokens from Obsidian secret storage

After disconnection, no trace of your Dropbox account connection remains on your device.

### Third Parties

The only third-party service involved is Dropbox’s OAuth and file API, which you authorize directly. We have no relationship with Dropbox beyond using their public APIs. We do not share, sell, or transfer any data to any entity.

### Your Rights

You have complete control:

- All data is on your local device; inspect it anytime
- Click "Disconnect" to erase all local credentials instantly
- Revoke access anytime in your Dropbox account’s connected-apps settings
- Your files remain in your Dropbox regardless of Plugin status

### Changes

Updates to this policy will be published in the Plugin’s GitHub repository and `https://sync.consensia.cc`. Continued use after changes constitutes acceptance.

### Contact

Open an issue on our GitHub repository for privacy-related questions.

## Terms of Service

Last updated on **November 3, 2026**.

### Acceptance

By installing or using the Sync Engine plugin for Obsidian with Dropbox module ("the Plugin"), you agree to these Terms. If you disagree, uninstall the Plugin immediately.

### License

The Plugin is provided under the MIT License. You may use, modify, and distribute it freely per that license’s terms.

### No Warranty

THE PLUGIN IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. THE AUTHORS AND COPYRIGHT HOLDERS SHALL NOT BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING FROM USE OF THE PLUGIN, INCLUDING DATA LOSS, SYNC FAILURES, OR DROPBOX API CHANGES.

### User Responsibilities

You are solely responsible for:

- Maintaining the security of your Dropbox account credentials
- Understanding what data you choose to sync
- Backing up important files independently of the Plugin
- Complying with Dropbox’s Terms of Service when connecting your account
- Ensuring your local device’s Obsidian secret storage remains secure

### Acceptable Use

Do not use the Plugin to:

- Violate Dropbox’s API Terms of Service
- Access accounts you do not own or lack authorization for
- Circumvent Dropbox storage or rate limits
- Distribute malware or illegal content via synced files

### Third-Party Services

The Plugin interacts with Dropbox’s OAuth and file APIs. These services are governed by Dropbox’s own Terms of Service and Privacy Policy. We have no control over Dropbox’s services and accept no liability for their availability, changes, or termination.

### Disconnection & Termination

You may terminate your use at any time by clicking "Disconnect" in the Plugin settings or uninstalling the Plugin. We reserve the right to discontinue development or distribution of the Plugin at any time without notice.

### Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL THE AUTHORS OR CONTRIBUTORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, DATA LOSS, OR BUSINESS INTERRUPTION, REGARDLESS OF THEORY OF LIABILITY.

### Governing Law

This Plugin is developed and maintained on a voluntary, non-commercial basis by contributors located in multiple jurisdictions worldwide. No single governing law applies.

These Terms shall be interpreted in accordance with general principles of international law and the MIT License under which the Plugin is distributed.

### Changes

We may update these Terms at any time. Changes take effect upon publication in the GitHub repository. Continued use constitutes acceptance.

### Contact

Open an issue on our GitHub repository for questions regarding these Terms.
