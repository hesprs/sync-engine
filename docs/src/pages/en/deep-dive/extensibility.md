# Extensibility Contract

Sync Engine loads modules by importing JavaScript files at runtime. A module is executable code, loading a module is **dynamic code execution**. The plugin implements a series of measures to minimize the attack surface.

## Trust Model

The module system trusts:

- the local operating system, Obsidian runtime, vault adapter, memory, and secret storage
- TLS as the transmission layer
- the official module source and its hosted artifacts
- modules explicitly downloaded by the user and their subsequent updates
- sources explicitly added by the user

The loader guards against:

- module files without existing record to prove user approval are not loaded automatically
- module file must match its recorded SHA-256 value before it is imported, unless explicitly disabled by the user
- compromised custom sources cannot disturb existing modules

## Module Sources

Module source URLs are stored in `settings.moduleSources`. The default source is `https://sync.consensia.cc/modules.json`, this is the official source hosted on GitHub pages, fully transparent.

Sync Engine officially hosts an alternative source `https://raw.githubusercontent.com/hesprs/sync-engine/refs/heads/gh-pages/modules-alternative.json`. This source is identical to the main source except replaced all `sync.consensia.cc` to `hesprs.github.io/sync-engine`. Use this source when your firewall flags `sync.consensia.cc` as unsafe.

::: warning

Please avoid using two sources simultaneously, if you have decided to use `https://raw.githubusercontent.com/hesprs/sync-engine/refs/heads/gh-pages/modules-alternative.json`, delete `https://sync.consensia.cc/modules.json` in the sources list.

:::

[Users add and remove source URLs in the setting page](../usage/settings#module-sources). The page accepts `http:` and `https:` URLs. Use HTTPS for sources whenever possible.

Plugin fetches every configured source with Obsidian `requestUrl()`. A source must contain a JSON array. Each accepted entry must contain string values for:

```TypeScript
type ModuleMeta = {
	id: string;
	name: string;
	version: string;
	description: string;
	main: string; // Download link
	icon?: string;
	minPluginVersion?: string;
	integrity: string;
};
```

Optional `icon` and `minPluginVersion` values are also supported. Entries requiring a newer plugin version remain identifiable in the catalog and mark the plugin as outdated; update the plugin before installing those modules. IDs containing common filename separators or metacharacters are skipped, and the integrity string must contain 64 hexadecimal characters.

Source contents are cached for automatic update checks during the current plugin lifetime. Duplicate IDs are filtered within each source.

The source entry supplies both the module download URL (`main`) and the expected integrity value.

## Local Module Storage

Module artifacts are stored in `<vault config directory>/plugins/sync-engine/modules/<id>.js`. The module directory is inside Obsidian's plugin configuration directory. New installations explicitly exclude this module directory, as well as the broader vault config directory, from synchronization.

Installed module metadata is stored in a IndexedDB store whose name is derived from the vault name: `modules-<hash of vault name>`, so normal attacking method (e.g. compromised syncing backend) cannot arbitrarily modify module meta.

The stored metadata extends source metadata with:

```ts
type AugmentedModuleMeta = ModuleMeta & {
  enabled: boolean;
  source: string;
  icon: string;
};
```

The `enabled` value used by module loading is stored in this local module record.

## Startup Loading

Startup loading performs the following steps:

1. Create the module directory if it does not exist.
2. List files and folders below the module directory.
3. Remove folders and files that do not end in `.js`.
4. Parse each JavaScript filename into a module ID.
5. Match each file with metadata from the local IndexedDB store.
6. Open a warning modal for a file with no stored metadata.
7. Load a module only when its stored metadata has `enabled: true`.

An unknown module is not loaded automatically. The user may configure it through the warning modal or delete it. Configuring an unknown module creates metadata for the local file. Its integrity value is calculated from the file when integrity verification is enabled.

When loading an installed artifact, the loader reads it through the vault `DataAdapter`. During a download, it may instead verify the fetched response text directly. When integrity check is not disabled by the user, it calculates SHA-256 over the module text and compares the result with the stored value.

The module is converted to a JavaScript `Blob` and dynamically imported only after this check. A default export that is not a function (class constructor) is rejected.

Integrity verification has these properties:

- It detects modification of a module file after its integrity value was recorded.
- It detects a mismatch between downloaded module text and metadata when an enabled module is loaded immediately.
- It can be disabled for an unknown local module through the module editor. This requires explicit user configuration.

## Download and Update Lifecycle

### Explicit Download

The Module Management UI exposes a download action for a module that is not installed or has a newer advertised version. The action:

1. requests the `main` URL;
2. reads the response as text;
3. writes the text to `<id>.js`;
4. stores the supplied metadata in IndexedDB;
5. loads the module immediately when it was already running or is marked enabled.

New modules are disabled by default. The downloaded text is integrity-checked before import when immediate loading occurs. A newly downloaded disabled module is written and stored without being imported; integrity is checked when the module is later enabled.

### Automatic Update

When automatic update is enabled, the loader schedules one update check after a short delay.

An advertised update is selected only when:

- its ID matches an installed module;
- its source URL exactly equals the installed record's source URL;
- its version compares greater than the installed version.

The update then follows the normal download path. A module that is running or marked enabled is unloaded and loaded from the newly downloaded text. A new module is never enabled by automatic discovery.

Changing a module's source through the module editor changes the stored source metadata and is a user action. A different configured source cannot automatically update an existing module because of the exact source comparison.

## Enablement and Unloading

The module management UI exposes an enable/disable toggle. Enabling stores `enabled: true` in the local module metadata and loads the module. Disabling unloads the module and stores `enabled: false`.

When loading fails, an enabled module is marked disabled in the local module store and a notice is shown. Loading failures include integrity mismatches, invalid module exports, and import errors.

Unloading calls the module's optional `dispose()` method and removes the constructor from the loaded-module map. Registration cleanup is cooperative: modules are expected to invoke cleanup callbacks returned by registration APIs from `dispose()`.

## Runtime Privileges

Modules receive the merged Sync Engine Context. The Context includes the live Obsidian `app` object and module APIs. The plugin also exposes the complete imported Obsidian namespace through `syncEngineApiBridge`; SDK builds rewrite module imports from `obsidian` to this bridge.

The registered module APIs include, among others:

- vault-wide local filesystem access
- remote filesystem creation and wrappers
- request creation and request middleware registration
- settings access
- capability registries for backends, resolvers, optimizers, listers, settings, and CSS
- SynthKernel module management helpers and the shared `allModules` set

These privileges are intentional for trusted modules. Similar to how Obsidian gives full API access to user downloaded and enabled plugins.
