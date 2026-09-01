# Distribution

Modules are distributed as single JavaScript files hosted on a web server. This page covers the module source schema and publishing workflow. For the internal extensibility architecture (trust model, loading lifecycle, integrity verification), see [deep dive: extensibility](../deep-dive/extensibility).

## Module Source Schema

A JSON array, each entry describes one module:

```json
[
  {
    "id": "webdav",
    "name": "WebDAV",
    "version": "0.0.2",
    "description": "WebDAV backend support.",
    "main": "https://sync.consensia.cc/modules/webdav.js",
    "integrity": "abc123..."
  }
]
```

### `ModuleMeta`

```ts
type ModuleMeta = {
  id: string; // Required. Identifier used in filenames. Cannot contain < > : " / \ | ? *
  name: string; // Display name shown in Module Management UI
  version: string; // Semver-compatible; used for update comparison
  description: string; // One-line description
  main: string; // Absolute URL to the built .js file to download from
  icon?: string; // Optional. Defaults to 'puzzle'
  minPluginVersion?: string; // Optional. Module skipped if plugin version is lower
  readme?: string; // Optional. Link to the module's README page, shown in Module Management UI
  integrity: string; // Required. 64-character hex SHA-256 hash of the module file
};
```

::: warning

The plugin validates all six required fields (`name`, `version`, `description`, `main`, `integrity`, `id`) and rejects entries missing any of them. `integrity` must be a 64-character hex string obtained from the SHA256 hash of module source code string.

:::

The `id` field cannot contain `< > : " / \ | ? *`. There is no character restriction on `name`.

## Magic Bytes

Module metadata can reach users through two channels:

- **Source metadata**: when a module is downloaded from a source, the entry from the source JSON is authoritative. Magic bytes in the downloaded file are ignored.
- **Magic bytes**: when a user installs a module from a local file through **Install module from file**, there is no source JSON. Sync Engine parses the `/*! ... */` comment at the top of the file and prefills the module editor with it. The user reviews and confirms the metadata before it is stored.

Build-time embedding of magic bytes with the [Tsdown plugin](./develop-a-module#magic-bytes) is therefore mainly useful for modules distributed as standalone files. If your module is distributed through a source, keep metadata in the source JSON and you can omit magic bytes entirely.

## Module Sources

The plugin reads module sources from URLs stored in settings:

```ts
moduleSources: ['https://sync.consensia.cc/modules.json'];
```

Users can add or remove source URLs in ["Module sources" setting](../usage/settings#module-sources). Any HTTP(S) URL serving a valid JSON source works.

## Local Storage

Modules are stored at `<vault>/.obsidian/plugins/sync-engine/modules/<id>.js`.

Version and metadata are persisted in IndexedDB (`AugmentedModuleMeta`). For details, see [deep dive: extensibility](../deep-dive/extensibility#local-module-storage).

## Auto-Update

When `Auto update modules` is enabled, on plugin load the plugin:

1. Waits 200 milliseconds.
2. Fetches all configured source URLs.
3. For each installed module, compares the remote version with the local version.
4. If the remote version is newer, queues a download.
5. Waits for the sync engine to be idle, then downloads and replaces the module file.

Only already-installed modules are auto-updated. New modules must be manually installed via the Module Management UI.

## Publishing a Module

For modules not part of the official monorepo:

1. Build your module into a single `.js` file with `integrity` (SHA-256 hash).
2. Host a module source JSON file at a stable URL (e.g., `https://my-modules.example.com/modules.json`).
3. Host each module's `.js` file at the URL specified in its `main` field.
4. Any static hosting works: JsDelivr, GitHub Releases, Cloudflare Pages, etc.
5. Users add your registry URL in **Settings > Sync Engine > Development > Module sources**.

It is highly recommended to contribute your module to the Sync Engine monorepo if you think your module can benefic more people, see [contributing](../usage/contributing#module-contribution).

### Computing `integrity` with `sha256`

The `integrity` field in `ModuleMeta` is a 64-character hex SHA-256 hash of the module's source code string. Use the `sha256` utility exported from `@hesprs/sync-engine-sdk/dev` to compute it:

```ts
import { sha256 } from '@hesprs/sync-engine-sdk/dev';

const source = await Bun.file('./dist/my-module.js').text();
const integrity = await sha256(source);
// → "a1b2c3d4..." (64 hex characters)
```

```ts
function sha256(input: string): Promise<string>;
```

It is a dev export (from `sdk/dev.ts`) because module integrity is computed at build time, not at runtime. This is the identical function that Sync Engine uses internally to verify integrity.
