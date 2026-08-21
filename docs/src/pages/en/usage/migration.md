# Migrate from V2

The v3 version of Sync Engine is released on August 7, 2026, its former name is "WebDAV Sync", which has been in production for months. The v2 to v3 transition is a complete rewrite focusing on modularity and performance; many things, **including remote file structure, storage schema, encryption formula, and plugin settings have changed completely**. A migration is required for all users that are still using v2.

## Automatic Migration

In the last two versions of WebDAV Sync (v2.5.12 and v2.5.13) contain a complete migration routine to seamlessly transform you from WebDAV Sync to Sync Engine.

At each startup, the plugin makes request to GitHub API to confirm the existence of repo `hesprs/sync-engine`, it treats the existence of this repo as the signal of the release of Sync Engine. If this repo exists, the plugin will open up a modal to prompt you to migrate to Sync Engine. The modal has two three options:

- **Proceed**: the migration will start
- **Cancel**: the migration will be prompted again on next plugin startup
- **Never show again**: the migration will be silenced forever and WebDAV Sync remains fully functional as before. You can access the migration routine from plugin settings.

If you started migration, it will perform the following:

1. Launch another turn of syncing to ensure your vault's state is aligned with the remote.
2. Read-only traverse the WebDAV to obtain the necessary `Etag` of each file, which is used by Sync Engine to identify file uniqueness.
3. Access Sync Engine module source `https://sync.consensia.cc/modules.json` to download necessary Sync Engine modules for you. The modules downloaded depends on the functions you used in WebDAV Sync:
   - Supported i18n modules if you are a non-English user.
   - Encryption module if you enabled encryption.
   - Smart merge module if your conflict strategy is "Smart merge".
4. Copy and transform existing sync records to Sync Engine store.
5. Only when all above steps succeed, local records will be deleted. And you will be prompted to Download Sync Engine from Obsidian plugin store.

If any of the 1-4 step fails, the migration will be rolled back immediately, no data will be lost.

Due to the revamped encryption schema, **WebDAV Sync encrypted files will be no longer accessible by Sync Engine's Encryption module**. So if you are using Encryption, you are required to delete remote base directory and **re-sync your vault in Sync Engine**. If you are not using encryption, you simply need to download Sync Engine from Obsidian module store and disable WebDAV Sync, then everything is done.

For seamless migration, **Sync Engine's most ingenious feature _Anchored Asymmetric Storage_ is disabled by default** if you are not using encryption (when encryption is enabled, this is left enabled since you will need to re-sync the entire vault anyway). You can enable that and use Sync Engine's built-in migration feature to transform your vault, then your every sync will be accelerated by this technology.

### Version `2.5.14`

Previous versions may have performance issue when encountering large vaults, which may lead to migration failure. This is a design defect and is patched in version `2.5.14`. If you find your migration failing in **step 5** with errors like `net::ERR_INSUFFICIENT_RESOURCES`, please [click here](https://github.com/hesprs/sync-engine/releases/download/2.5.14/main.js) to download the patched version, replace `<your vault>/.obsidian/plugins/webdav-sync/main.js`, and try migration again.

## Manual Migration

If you need a more transparent migration process to see what is going on around your data. You can choose manual migration, you need to perform all the following:

1. Go into Obsidian, use WebDAV Sync to sync all your devices to ensure they have aligned copies of your data. If it shows the migration prompt, choose "cancel" directly.
2. Disable and delete WebDAV Sync on every devices.
3. Install Sync Engine from Obsidian plugin store.
4. Install the `WebDAV` module from the module management page in Sync Engine settings, configure your account on every devices.
5. If you previously **enabled encryption**, please download the Encryption module and configure the encryption password. The manually delete the remote base directory on your WebDAV management UI. Choose one of your devices with better internet connection to sync your encrypted full vault to the remote.
6. If you are not using encryption previously, **go to Sync Engine settings and disable "Asymmetric storage", you do not need to delete any data anywhere.**
7. Perform sync on all other devices, Sync Engine should scan the remote folder and picks up the aligned state, populates its internal records only and shows "Already synced".
