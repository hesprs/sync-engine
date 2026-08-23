# Google Drive Module

The Google Drive module registers the `gdrive` remote file system. It stores the vault in a Google Drive folder and performs file operations through the Google Drive public API. The module uses Google OAuth for authentication and does not use a third-party server or proxy.

## Settings

The module adds a **Google Drive** settings group. Configure these settings
before selecting Google Drive as the remote file system:

### Connect account / Account connected

This setting initiates the Google authorization process. Once authorized, the module stores the refresh token securely in Obsidian's secret storage and uses it to obtain short-lived access tokens as needed. The **Disconnect** option revokes the token with Google, removes it from secret storage, clears any cached access tokens, and deletes the stored account identifier.

### Base directory

This defines the folder in Google Drive that serves as the root directory for this vault. The value is normalized as a directory path. If left empty when the module starts, it defaults to `<vault name>/`. The specified folder is created automatically during the first synchronization.

::: warning

The base directory is an application-managed namespace. The module can see and operate only on files that it created through its Google Drive integration. Files or folders created manually in Drive, or created by another application, are not visible to this module even when they are inside the configured base directory. They will not be imported, synchronized, or listed.

Do not manually create, rename, move, or maintain vault files in this Drive folder. Set the base directory in the module settings, then let the first sync create it and let Sync Engine manage its contents. Manual Drive operations can leave files outside the module's visible set or cause conflicting changes.

This is a consequence of Google's `drive.file` scope, not a filtering option that can be disabled in Sync Engine. The module is intentionally not granted full Drive access.

:::

### Delete to trash

When enabled, files deleted remotely are moved to the Google Drive trash instead of being permanently removed. When disabled, deleted files are permanently erased immediately. Note that Google Drive typically clears items from the trash after 30 days.

## Permissions And Scopes

The module requests exactly these OAuth scopes:

### `drive.file`

This scope permits the module to create and manage files that it creates in Google Drive. Sync requires this access to:

- Create the base directory and vault files
- List the module's files so it can discover remote changes
- Read file contents and metadata
- Upload new contents and update existing files
- Move or rename files
- Delete files, either permanently or by moving them to trash

The scope does **not** grant general access to the user's Drive. In particular, the module cannot discover or synchronize files created outside the plugin. Granting `drive.file` is a deliberate least-privilege choice: the module can manage its own sync data without receiving permission to read unrelated Drive files.

### `openid`

The `openid` scope makes Google return an OpenID Connect ID token during device authorization. The module reads the token's stable `sub` subject identifier and stores it as the connected account identifier. This lets Sync Engine identify which Google account is connected and distinguish multiple account connections, so that the sync record for different Google accounts don't interfere; it does not read the user's profile or request broad identity permissions.

## Authentication Flow

The module uses [**Google OAuth 2.0 for TV and Limited-Input Device Applications**](https://developers.google.com/identity/protocols/oauth2/limited-input-device):

1. When you click **Connect**, the module requests a device code from Google's device authorization endpoint with the two scopes above.
2. Obsidian displays Google's verification URL and a one-time user code. The module can copy the code and open the URL in a browser.
3. You sign in to Google in that browser and approve the requested access.
4. While the dialog remains open, Obsidian polls Google's token endpoint. It waits when authorization is pending and backs off when Google requests a slower polling interval.
5. After approval, Google returns a short-lived access token, a refresh token, and an OpenID ID token. The module extracts the account subject from the ID token, stores the refresh token in Obsidian's secret storage, and caches the access token in memory.
6. Later Drive requests use the cached access token. When it is close to expiry, the module exchanges the refresh token for a new access token. A failed request with HTTP 401 causes one forced refresh and retry.

Device authorization is used because Obsidian mobile cannot reliably provide the local browser redirect, localhost listener, or desktop-style custom URL callback required by common interactive OAuth flows. Device authorization keeps the OAuth interaction in a normal browser while the Obsidian app polls Google's endpoint, so the same connection flow works on desktop and mobile.

## Privacy Policy

Last updated on **August 23, 2026**.

### Introduction

This Privacy Policy describes how the Sync Engine plugin for Obsidian with Google Drive module (“the Plugin”) handles your data when you connect a Google Drive account. The Plugin is open-source software licensed under the MIT License.

### Data We Collect

**We collect no data.** The Plugin has no telemetry, no analytics, no remote logging service, and no backend server. No information about you, your files, or your usage ever leaves your local device.

### How Your Data Is Handled

**Google Account Connection**:

When you click “Connect,” the Plugin initiates a Google Device Authorization flow directly between your device and Google’s servers. The Plugin requests only these scopes:

- `drive.file`: Access to files created by the Plugin. Files created outside the Plugin are not visible to it, even inside the configured base directory.
- `openid`: Supplies a stable Google account subject identifier so the Plugin can identify and deduplicate connections

**Token Storage**:

OAuth refresh tokens are stored exclusively in Electron’s encrypted secret storage on your local device. Tokens are never transmitted to any third party, never logged, and never included in crash reports or diagnostics.

**File Operations**:

All sync operations are triggered or scheduled manually by you. File reads and writes occur directly between your local Obsidian vault and Google Drive via Google’s API. No intermediary servers are involved.

**Data Retention**:

Your data exists only on your local device and in your own Google Drive account. When you click “Disconnect,” the Plugin:

1.  Revokes the OAuth token with Google
2.  Deletes all stored tokens from Electron secret storage

After disconnection, no trace of your Google Account connection remains on your device.

### Third Parties

The only third-party service involved is Google’s OAuth and Drive API, which you authorize directly. We have no relationship with Google beyond using their public APIs. We do not share, sell, or transfer any data to any entity.

### Your Rights

You have complete control:

- All data is on your local device; inspect it anytime
- Click “Disconnect” to erase all local credentials instantly
- Revoke access anytime at `https://myaccount.google.com/permissions`
- Your files remain in your Google Drive regardless of Plugin status

### Changes

Updates to this policy will be published in the Plugin’s GitHub repository and `https://sync.consensia.cc`. Continued use after changes constitutes acceptance.

### Contact

Open an issue on our GitHub repository for privacy-related questions.

## Terms of Service

Last updated on **August 23, 2026**.

### Acceptance

By installing or using the Sync Engine plugin for Obsidian with Google Drive module (“the Plugin”), you agree to these Terms. If you disagree, uninstall the Plugin immediately.

### License

The Plugin is provided under the MIT License. You may use, modify, and distribute it freely per that license’s terms.

### No Warranty

THE PLUGIN IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. THE AUTHORS AND COPYRIGHT HOLDERS SHALL NOT BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING FROM USE OF THE PLUGIN, INCLUDING DATA LOSS, SYNC FAILURES, OR GOOGLE DRIVE API CHANGES.

### User Responsibilities

You are solely responsible for:

- Maintaining the security of your Google Account credentials
- Understanding what data you choose to sync
- Backing up important files independently of the Plugin
- Complying with Google’s Terms of Service when connecting your Drive account
- Ensuring your local device’s Electron secret storage remains secure

### Acceptable Use

Do not use the Plugin to:

- Violate Google’s API Terms of Service
- Access accounts you do not own or lack authorization for
- Circumvent Google Drive storage or rate limits
- Distribute malware or illegal content via synced files

### Third-Party Services

The Plugin interacts with Google’s OAuth and Drive APIs. These services are governed by Google’s own Terms of Service and Privacy Policy. We have no control over Google’s services and accept no liability for their availability, changes, or termination.

### Disconnection & Termination

You may terminate your use at any time by clicking “Disconnect” in the Plugin settings or uninstalling the Plugin. We reserve the right to discontinue development or distribution of the Plugin at any time without notice.

### Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL THE AUTHORS OR CONTRIBUTORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, DATA LOSS, OR BUSINESS INTERRUPTION, REGARDLESS OF THEORY OF LIABILITY.

### Governing Law

This Plugin is developed and maintained on a voluntary, non-commercial basis by contributors located in multiple jurisdictions worldwide. No single governing law applies.

These Terms shall be interpreted in accordance with general principles of international law and the MIT License under which the Plugin is distributed.

### Changes

We may update these Terms at any time. Changes take effect upon publication in the GitHub repository. Continued use constitutes acceptance.

### Contact

Open an issue on our GitHub repository for questions regarding these Terms.
