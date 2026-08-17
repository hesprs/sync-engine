# Module Management UI

Sync engine allows users to load custom modules from custom sources, so it needs an UI to allow users to configure modules.

## UI Composition and Functions

Modal is a singleton module class accepting context in constructor, extending `Modal` class, with `open()` and `close()` injected into root context.

Modal frame uses Obsidian CSS variables for large modal:

```css
width: var(--modal-width);
height: var(--modal-height);
max-width: var(--modal-max-width);
max-height: var(--modal-max-height);
```

Modal has two parts from up to down:

- Native Obsidian controls
- Solid reactive list

### Native Obsidian Controls

A wide search bar at very top, with a small menu icon at right. The bar and the icon take full width of the modal.

The search bar uses Obsidian API `SearchComponent`, the menu icon uses Obsidian `setIcon` + `setTooltip`, clicking on it opens Obsidian `Menu`.

The menu contains only two items: `Show installed only`, and `Edit sources`.

Clicking `Show installed only` toggles the flag, and becomes checked via `MenuItem.setChecked()`. Clicking `Edit sources` opens a new normal modal similar to `packages/plugin/src/components/FilterEditorModal.ts` that allows user to add and delete module sources.

### Solid Reactive List

A solid reactive island also accepts `context`, majorly consumes `Extensibility` module APIs. Parent Module Management UI passes three SynthKernel hooks `onQuery`, `onShowInstalledOnlyChange`, and `onSourcesChange` during the reactive list instantiation.

`onQuery` is fired each keystroke in the search bar carrying the user query. `onShowInstalledOnlyChange` fired each `Show installed only` toggle. `onSourcesChange` is fired each source edit save.

Once mounted, the reactive list uses `fetchSources()` to obtain modules list. Then it renders modules as cards. The widths of cards and number of cards per row are adaptive according to current modal width. And cards in each row takes full width of that row. The height of each row depends on the tallest card.

Each card has the following layout:

- Top row: module name
- Middle block: module description
- Bottom row: right-aligned action buttons

Action buttons use Obsidian `setIcon()` and `setTooltip()`, buttons have following combinations:

- Download button: module not installed, or module has a new version. Clicking on the button triggers `downloadModule()`.
- Delete button: module installed. Clicking on it triggers `deleteModule()`.
- Enable button: module installed but not loaded. Clicking on triggers `enableModule()`.
- Disable button: module installed and loaded. Clicking on triggers `disableModule()`.

The modules are sorted alphabetically by default, or sorted in match score if last `onQuery` payload is non-empty string. Query matching uses Obsidian API `prepareFuzzySearch()`. Currently, since the module set is small, so no optimization needed.

When `Show installed only` is selected, the list should only present installed modules.

When `onSourcesChange` fires, the list `fetchSources()` again and updates.
