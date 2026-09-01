# Settings and UI

Sync Engine settings use Obsidian's setting definitions. Modules can contribute nested groups, pages, lists, controls, and custom rendered settings without owning the plugin settings tab. This page also covers the translation and migration helpers used by module UI.

## Nested Setting Registration

Register a setting tree with `registerSetting()`. Each tree describes one branch of the Settings tab. The top-level `priority` determines which setting is merged first; numeric keys inside `apply` order items at each level and tell Sync Engine where branches should be merged.

```ts
type SettingEntry = {
  priority: number;
  apply: CallableOrObjectTree;
};

ctx.registerSetting(entry: SettingEntry): () => boolean;
```

### Extensible Setting Trees

The value passed to `apply` is a nested object. Each numeric key points to either another nested object or a callback that returns one Obsidian setting definition:

```ts
type CallableOrObjectTree =
  { [order: number]: CallableOrObjectTree } | ((self: SettingTree) => SettingDefinitionItem);
```

Sync Engine walks this object from the smallest numeric key to the largest and renders the callbacks as Obsidian settings. Numeric keys are not setting names, persisted setting keys, or numeric control values. They only provide sibling order and identify the branch where an extension is inserted. They do not need to be consecutive:

```ts
{
  1000: /* first item */,
  3000: /* second item */, // 2000 is not required
}
```

When registrations contain the same key at the same level, Sync Engine merges their children. This is the key feature of this API: a module can extend an existing nested group without replacing the group or owning the Settings tab. The existing parent callback remains responsible for rendering all children after the merge.

For example, core settings can register a Features group at `1000`:

```ts
{
  1000: s(
    (self) => ({
      heading: 'Features',
      items: Object.values(self).map((node) => node(node)),
      type: 'group',
    }),
    {
      1000: s(() => ({ name: 'Realtime sync', control: { key: 'realtime', type: 'toggle' } })),
    },
  ),
}
```

Encryption extends that group by returning another tree with the same path key and a new child key:

```ts
{
  1000: {
    6037: s(() => ({
      name: 'Encryption',
      render: (setting) => {
        // Add encryption password and toggle controls here.
      },
    })),
  },
}
```

After merging, the existing `1000` group callback sees both children:

```text
1000  Features (group)
├── 1000  Realtime sync
└── 6037  Encryption
```

The first `1000` identifies the group. The child `1000` and `6037` keys order settings inside that group. The module's registration `priority` controls when its root tree is merged with other registrations; it is separate from numeric keys inside the tree.

Use the SDK `s()` helper when defining a parent and its children together. It attaches the child tree to the parent callback. The parent receives the complete node after all extensions have been merged:

```ts
import type { Context, CallableOrObjectTree } from '@hesprs/sync-engine-sdk';
import type { SettingGroupItem } from 'obsidian';
import { s } from '@hesprs/sync-engine-sdk';

export default function mySettings(
  ctx: Context,
  settings: { enabled: boolean },
): CallableOrObjectTree {
  return {
    2000: s(
      (self) => ({
        heading: ctx.translate('mySettings'),
        items: Object.values(self).map((node) => node(node) as SettingGroupItem),
        type: 'group',
      }),
      {
        1000: s(() => ({
          control: { key: 'enabled', type: 'toggle' },
          name: ctx.translate('enabled'),
        })),
      },
    ),
  };
}
```

The example produces one **My settings** group containing one **Enabled** toggle:

```text
2000  My settings (group)
└── 1000  Enabled (toggle)
```

The two keys belong to different levels, so they do not conflict. If another module adds a child at `2000` under the same group node, the merged group contains both children in this order:

```text
2000  My settings (group)
├── 1000  Enabled
└── 2000  Another setting
```

Register the returned tree during module startup and remove it during disposal:

```ts
const removeSettings = ctx.registerSetting({
  apply: mySettings(ctx, this.moduleSettings),
  priority: 1355,
});
this.cleanup.push(removeSettings);
```

Use a `group` for a heading and its children, a `page` for a separate settings page, a `list` for editable repeated entries, or a normal setting definition with `control` or `render`. A parent callback must convert its child callbacks into the `items` expected by Obsidian, as shown with `Object.values(self).map((node) => node(node))` above.

Core setting sections use these priorities:

| Section           | Priority | Contents                                                                   |
| ----------------- | -------: | -------------------------------------------------------------------------- |
| Top configuration |      `0` | Backend, module management, decider, conflict resolver.                    |
| Features          |   `1000` | Realtime, startup, scheduled sync; realtime fast mode; asymmetric storage. |
| Controls          |   `2000` | File-size, request-concurrency, request-interval, memory limits.           |
| Filter rules      |   `3000` | Inclusion and exclusion rule pages.                                        |
| Miscellaneous     |   `4000` | Custom headers, mobile notices, task confirmation, deletion confirmation.  |
| Development       |   `5000` | Record cleanup, log export, and module source pages.                       |

Settings contributed by modules are included when the module loads and removed when it unloads. The settings tab refreshes after either event.

## Setting Labels

Obsidian's setting definitions do not include labels. Sync Engine augments normal setting and page definitions with a `labels` property, then renders each label as a colored badge beside the setting name. Each label has text and a tooltip, with optional `color` and `textColor` values:

```ts
import type { LabelDefinition } from '@hesprs/sync-engine-sdk';

const labels: Array<LabelDefinition> = [
  {
    text: 'Match',
    tooltip: 'This setting must be kept the same on all devices.',
  },
];
```

Add labels to a setting definition returned by a tree callback:

```ts
const matchLabel = ctx.matchLabel();

return s(() => ({
  control: { key: 'baseDirectory', type: 'text' },
  labels: [matchLabel],
  name: 'Base directory',
}));
```

Modules normally use the existing label factories from context so their text, colors, and translations match core settings:

```ts
const { matchLabel, speedLabel } = ctx;

return s(() => ({
  labels: [matchLabel(), speedLabel()],
  name: 'Chunk size',
  render: (setting) => {
    // Render the setting control here.
  },
}));
```

Sync Engine currently provides these labels:

| Label     | Meaning                                                  |
| --------- | -------------------------------------------------------- |
| **Match** | Setting should have the same value on every device.      |
| **Speed** | Correct configuration can improve synchronization speed. |

Use a custom `LabelDefinition` when a setting needs a module-specific explanation. Labels describe a setting; they do not change its value, validation, or synchronization behavior.

## Reactive Input Validation

`reactivelyValidate()` attaches live validation to a setting text input. It parses the value on every change, flags invalid input with a warning style, and saves only the parsed value when the input loses focus:

```ts
import { reactivelyValidate } from '@hesprs/sync-engine-sdk';

setting.addText((text) => {
  text.setValue(settings.name);
  reactivelyValidate<string>({
    onSave: (value) => {
      settings.name = value;
      void saveSettings();
    },
    parse: (value) => value.trim(),
    text,
  });
});
```

`parse` can return any type. Return `undefined` to mark the input as invalid, for example `parse: (value) => Number.parseFloat(value) || undefined` rejects non-numeric input. `format` (default `String`) re-displays the parsed value on save, and `immediate: true` validates the initial value once on setup.

## Editable Lists

`generateEditableList()` produces an Obsidian `list` setting definition for repeated editable entries, such as module sources or custom headers. Draft edits live in an ephemeral store so they survive setting tab rerenders, and only valid items are written back to settings on save:

```ts
import { generateEditableList } from '@hesprs/sync-engine-sdk';

{
  1000: () =>
    generateEditableList({
      defaultValue: '',
      identifier: 'tags',
      items: settings.tags,
      memoryDB: ctx.memoryDB,
      render: (setting, item, save) => {
        setting.addText((text) => {
          text.setValue(item.value);
          text.inputEl.addEventListener('blur', () => {
            item.value = text.getValue().trim();
            item.valid = item.value !== '';
            save();
          });
        });
      },
      rerenderSettingTab: ctx.rerenderSettingTab,
      saveSettings,
      translations: {
        add: translate('addTag'),
        empty: translate('noTagConfigured'),
      },
    }),
}
```

How it works:

- `items` is the live array stored in settings. `identifier` keys the draft list inside the ephemeral store of `memoryDB`, pass `ctx.memoryDB`. Drafts survive setting tab rerenders but are not persisted until saved.
- `render` draws one draft item `{ value, valid, new }`, mutate `value` and `valid` and call the provided `save` callback. The `new` flag can be used to focus freshly added items, and `reactivelyValidate()` (above) fits naturally here.
- `save` writes all valid items back into `items` and calls `saveSettings()`, but only when the resulting list actually changed.
- The add button appends a clone of `defaultValue` and rerenders through `rerenderSettingTab`. Deleting an item removes it from the draft list, saves, and rerenders.
- `translations` supplies the add-button text and the empty-state text, `heading` optionally names the list, and `extraButtons` adds custom buttons that receive the draft list and the `save` callback.

## Internationalization

Sync Engine merges translation resources from all loaded modules. Register resources with `registerI18n()` and use the typed `translate()` function from the context.

```ts
import type { ObsidianLanguageCode, Translate, TranslationResource } from '@hesprs/sync-engine-sdk';

const messages = {
  connected: 'Connected to {{backend}}.',
  files: (frag: DocumentFragment, { succeeded, failed }: { succeeded: number; failed: number }) => {
    frag.createEl('p', { text: 'Files synchronized:' });
    const list = frag.createEl('ul');
    list.createEl('li', { text: `${succeeded} succeeded` });
    if (failed) list.createEl('li', { text: `${failed} failed` });
  },
} satisfies TranslationResource;

const language: ObsidianLanguageCode = 'en';
ctx.registerI18n(language, messages);

const translate: Translate<typeof messages> = ctx.translate;
const label = translate('connected', { backend: 'WebDAV' });
const summary = translate('files', { succeeded: 3, failed: 0 });
```

String resources return strings and support `{{name}}` interpolation. Fragment resources receive a `DocumentFragment` and typed arguments, then return a `DocumentFragment` from `translate()`. Use Obsidian DOM helpers such as `createEl()`, `createSpan()`, `createDiv()`, and `appendText()` when building fragments.

`ObsidianLanguageCode`, `Fragment`, `TranslationResource`, and `Translate` are SDK exports. The full core English resource map is available in [Sync Engine core English translations](https://github.com/hesprs/sync-engine/blob/main/packages/plugin/src/en.ts).

Register translations before settings or other UI that uses them. `registerI18n()` returns `void`, so it must not be added to a cleanup callback array.

## Migration-Aware Toggles

Use `setNeedMigration()` when changing a toggle can make existing records or remote files incompatible with the new setting. The helper opens Sync Engine's migration dialog when migration is required.

```ts
import { setNeedMigration } from '@hesprs/sync-engine-sdk';

setNeedMigration(ctx, {
  toggle,
  needMigration: (value) => recordStoreExists(),
  content: (value) => (value ? 'Encryption will be enabled.' : 'Encryption will be disabled.'),
  apply: async (value) => {
    settings.enabled = value;
    await ctx.saveSettings();
  },
});
```

`needMigration` receives the proposed boolean value and may return a boolean or promise. When it returns `true`, the toggle is reverted and the user can cancel, apply the change without migration, or start migration. When it returns `false`, `apply` runs immediately. If `needMigration` is omitted, migration is required by default.

`content` supplies the explanation shown in the migration dialog. `apply` runs after the user chooses either migration or toggle-without-migration. Both callbacks may be asynchronous.

The migration dialog is an internal UI component; `setNeedMigration()` is the public SDK helper.
