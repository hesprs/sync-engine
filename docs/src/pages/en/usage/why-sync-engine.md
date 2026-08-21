# What's Sync Engine

**Sync Engine** is a sync plugin for Obsidian that you extend with modules — you install only the pieces you need, and your notes stay in sync across your devices. The Sync Engine core is reliable and highly optimized with months of human iteration and battle-testing.

In practice, this means you pick a storage backend (your own WebDAV server, for example), optionally add advanced features like encryption, and press "Sync". You don't configure features you won't use, and you don't carry code for services you'll never connect to. The sync remains fast and reliable, regardless of the backend you are using.

**Real human maintainers are accountable for Sync Engine**. Although Sync Engine accepts AI-assisted module contribution. The Sync Engine core (the plugin) is strictly human-written and rejects any "vibe-coding". It consists of many ingenious engineering innovations that no AI can replicate.

## Similar Choices

There are several ways to sync an Obsidian vault:

- **[Obsidian Sync](https://obsidian.md/sync)** is the official, zero-setup option. If you want sync working in under a minute and don't mind a monthly fee, start there.
- **[Remotely Save](https://github.com/remotely-save/remotely-save)** supports many backends (S3, Dropbox, OneDrive, WebDAV). But is optionally paid, development paused for years with stability issues
- **[Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync)** and **[Fast Note Sync](https://github.com/haierkeys/obsidian-fast-note-sync)** offer real-time, server-based sync. They work well if you are comfortable setting up your own server.
- **[Relay](https://github.com/No-Instructions/Relay)** is a managed relay service. Convenient, but your notes pass through infrastructure you don't control.

Sync Engine fits the gap: you want to choose your own storage, you want the plugin to stay small because unused features aren't bundled in, and you want a highly optimized syncing that is no slower than a custom server.

## Features

Sync Engine core offers necessary features to ensure the extensibility and performance:

### Core Functions

- Bidirectional / mirror local / mirror-remote syncing.
- Startup / periodic / save-on-change syncing.
- Conflict resolution strategies (keep both / latest survive / keep remote / keep local / skip).
- Rate / memory control options.
- Custom headers.
- You can extend most above features by writing modules.

### Extensible Architecture

- You can add backends, optimizers, sync triggers, i18n resources, decision strategies, conflict strategies, setting entries, custom file processing, and invoke all possible operations in custom modules.
- Documentation, AI agent skills, and SDK with debug and testing kit are provided.
- Plugin provides dedicated module discovery and management UI.
- Repo accepts any module contribution as long as it respects [contribution guide](./contributing).

### Radical Optimization

- Incremental syncing never uploads the full vault each time.
- [Anchored Asymmetric Storage](../deep-dive/asymmetric-storage) technology substantially accelerates syncing.
- Real-time sync uses cached remote states, allowing it to complete within milliseconds.
- [Benchmarking shows around **100x** faster than Remotely Save in daily syncing](./benchmark).
- Handles vaults with thousands of files smoothly.
- Highly optimized core sync timing never wastes one millisecond.
- Extensible optimizer slot ensures every request is optimized for your own service.
- Detailed performance comparison can be found in [performance benchmark](./benchmark).

### Available Modules

**Backends**:

- [WebDAV](../deep-dive/modules/webdav): standard WebDAV protocol implementation with battle-tested compatibility regressions. Supports any backend providing WebDAV API.
- [S3](../deep-dive/modules/s3): Amazon S3 and S3-compatible object storage with optimized batch deletions.

**Features**:

- [Encryption](../deep-dive/modules/encryption): meticulously designed encryption with specially enhanced safety for cross-backend syncs.
- [Smart Merge](../deep-dive/modules/smart-merge): conflict resolution strategy powered by recursive three-way merge.

**Translations**:

- **Native English**
- **I18n 简体中文**

## Usage

It is simple to start using Sync Engine:

1. Download and enable `Sync Engine` from Obsidian plugin store.
2. Open "Module management" page, install needed translations, backends and optional features.
3. Fill the necessary information about your cloud service in the settings interface.
4. Start your first sync from command palette or ribbon button.
5. Review the sync tasks that will be performed.
6. Click "Confirm", and your files will arrive the configured backend at the speed of light.

::: tip

Sync Engine requires minimum version of Obsidian v1.13.0. If you are on Android or iOS, the cutoff is Android System Webview 98 or iOS 15.4. It cannot function normally on devices below these thresholds.

:::

## Development

If you think Sync Engine basic features cannot satisfy what you need and want to customize, here's why we recommend you to create a Sync Engine module instead of creating your own plugin:

1. Sync Engine is highly optimized and battle-tested, develop upon Sync Engine will save you enormous time on testing and debugging.
2. Sync Engine provides official SDK and clear documentations, its core already has mature syncing abstractions, you don't need to reinvent the wheel.
3. Sync Engine's module ecosystem has multiplication effect, you can implement you own features while using functions from other modules. Instead of write all those features in a huge monolithic plugin.

About how to develop a module, refer to [development documentation](../development/develop-a-module). See [contributing standards](./contributing) if you want to contribute to the official repo.
