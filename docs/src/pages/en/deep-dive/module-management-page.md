# Module Management Page

Sync Engine uses a native Obsidian settings page to manage executable modules from configured sources. Open it from [Module management](../usage/settings#module-management).

## Page Layout

`ModuleManagement` extends Obsidian's `SettingPage`. Its page contains:

- a full-width search field;
- an icon button that opens a menu with the **Show installed only** toggle, **Install module from file**, **Install module from code**, and **Refresh sources**;
- a Solid.js module-card grid.

Module source URLs are edited separately on **Settings > Sync Engine > Development > Module sources**. Returning to Module management creates a new source snapshot and refreshes the catalog.

The search field uses Obsidian's `SearchComponent`. An empty query sorts modules alphabetically by module ID. A non-empty query uses `prepareFuzzySearch()` against module names and descriptions, then sorts by match score and module ID.

**Install module from file** opens a file picker that accepts `.js` and `.mjs` files; other extensions are rejected with a notice. The chosen file opens the module editor with metadata prefilled from the file's magic bytes, see [extensibility: install from file](./extensibility#install-from-file). **Install module from code** opens a code input modal where the user pastes module code, then follows the same editor flow.

## Module Cards

Each card displays the module icon, name, version, source status, description, and available actions:

- **Download** installs a module that is not installed or has a newer advertised version.
- **README** opens the module's README page when its metadata provides one.
- **Edit** opens the module metadata and integrity settings.
- **Delete** removes the installed module and its stored metadata.
- **Enable** stores `enabled: true` and loads the module.
- **Disable** unloads the module and stores `enabled: false`.

Actions are disabled while another action for the same module is running. Running actions display a progress icon. Module cards are merged by module ID, with installed metadata taking precedence over source metadata.

## Source And Compatibility State

`fetchSources()` reads every configured source. Source responses are cached for automatic update checks. The **Refresh sources** menu item forces a refresh and shows a notice with the number of discovered modules and sources. Duplicate IDs within a source are ignored.

If a source entry declares a `minPluginVersion` newer than the running plugin, the catalog marks the plugin as outdated. Update Sync Engine before installing modules that require the newer version.

Newly downloaded modules are disabled by default. Automatic updates only apply to already-installed modules whose recorded source URL matches the advertised source URL.
