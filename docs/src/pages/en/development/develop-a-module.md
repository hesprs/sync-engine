# Writing a Sync Engine Module

Modules lets you unlock infinite extension beyond Sync Engine base features. This documentation covers everything you need to write, build, test, and publish a module.

## Scaffolding a Module Project

To develop a Sync Engine module, you at least need a JavaScript Runtime and a package manager, for example, `Bun`, or `Node.js` + `npm`/`pnpm`.

Create a project folder and run following command, you can use any package manager, throughout this documentation we will be using `Bun`:

```sh
bun init -y
bun add -D @hesprs/sync-engine-sdk tsdown
```

`@hesprs/sync-engine-sdk` is the official SDK for Sync Engine modules. And Tsdown is the recommended bundler.

::: tip

If your module needs to use Obsidian API, you can add:

```sh
bun add obsidian
```

:::

Then we need to populate the project with some setup, a typical Sync Engine module has the structure like:

```txt
your-module
├── src
│   ├── i18n.ts (optional: translation objects)
│   ├── index.ts (module entry)
│   ├── setting.ts (optional: settings factory)
│   └── ...
├── test (if you want tests)
│   └── ...
├── package.json
├── tsconfig.json
├── tsdown.config.ts
└── ... (linter, formatter, etc.)
```

Create `tsdown.config.ts` and write following content:

```TypeScript
import { syncEngineTransform } from '@hesprs/sync-engine-sdk/dev';
import { defineConfig } from 'tsdown';

const dev = process.env.MODE === 'dev';

export default defineConfig({
	clean: !dev,
	dts: false,
	entry: { 'your-module-id': 'src/index.ts' },
	minify: true,
	outExtensions: () => ({ js: '.js' }),
	outputOptions: { codeSplitting: false },
	plugins: [syncEngineTransform()],
});
```

This config makes Tsdown output a single minified JavaScript file, which can be directly loaded by Sync Engine core. The `syncEngineTransform` plugin makes you able to use Obsidian API directly in your module.

Finally add following commands to your `package.json`:

```json
{
  "scripts": {
    "dev": "MODE=dev tsdown",
    "build": "tsdown"
  }
}
```

## Module Contract

A Sync Engine module is a plain JavaScript ESM file that has a default export of a class. The class receives `Context` injection in its constructor, provides settings, and registers capabilities during its lifecycle. A minimal `index.ts` could be like:

```TypeScript
import type { Context } from '@hesprs/sync-engine-sdk';

export default class MyModule {
  constructor(private readonly ctx: Context) {}

  readonly moduleSettings = {
    // Declare persistent settings with default values
  };

  start(): void {
    // Configure resources needed by the plugin
    // Register capabilities
  }

  dispose(): void {
    // Unregister capabilities and release resources
  }
}
```

Every module:

1. **Default exports** a module class
2. Accepts a **single constructor parameter** typed with `Context` (see [Registration](./registration) for the `register*` API and [Miscellaneous](./miscellaneous) for the full member list)
3. Optionally declare a `readonly moduleSettings` property with default values
4. Optionally implement `start()` to register capabilities and start activity, this method is executed when the module is loaded
5. Optionally implement `dispose()` to clean up, which is executed when the module is unloaded

::: tip

- You can use Node.js and Browser APIs in your module, but if you need mobile compatibility, please avoid using Node.js API.
- Use **Sentence case** for all UI text, this is an Obsidian standard.
- Access **Obsidian API** directly via `obsidian` import (this is bridged gracefully via `syncEngineTransform`).
- Register i18n resources first so that later registration can use them.
- Unregister all registered capabilities during disposal.

:::

You can found abundant module examples in Sync Engine monorepo:

- [Encryption](https://github.com/hesprs/sync-engine/tree/main/packages/encryption): uses settings, i18n, file system, and in-memory database API.
- [Smart Merge](https://github.com/hesprs/sync-engine/tree/main/packages/smart-merge): uses settings, i18n, file system, IndexedDB, and conflict resolution API.
- [WebDAV](ttps://github.com/hesprs/sync-engine/tree/main/packages/webdav): great example of how to add a backend to Sync Engine.

## Build A Feedback Loop

We recommend creating a symbolic link from the Sync Engine `modules/` folder to your module `dist/` folder:

```sh
ln -s /path/to/your/vault/.obsidian/plugins/sync-engine/modules /path/to/your/project/dist
```

Remember we have the following in Tsdown config and `package.json`:

```TypeScript
const dev = process.env.MODE === 'dev';
export default defineConfig({
	clean: !dev,
});
```

```json
{
  "dev": "MODE=dev tsdown"
}
```

So simply run `bun dev`, and your module will be rebuilt inside the right folder without clearing other modules.

After rebuilding, you need to reload the module in module management UI to apply latest changes. Or you can use the [Hot Reload](https://github.com/pjeby/hot-reload) plugin to reload Sync Engine on each build, so your module will also be reloaded.

To reliably reload Sync Engine modules without triggering its integrity protection, you need to manually disable integrity verification in the module editor interface in [module management page](../deep-dive/module-management-page). Make sure you only disable the verification of the module you are developing, see [Security](../usage/security) for security implications.

## Load CSS in a Module

Sync Engine allows modules to bring their custom CSS.

Firstly, add Tsdown CSS package, which makes it able to process CSS files:

```sh
bun add -D @tsdown/css
```

Create a CSS file, and load the inlined CSS dynamically in your module:

```TypeScript
import type { Context } from '@hesprs/sync-engine-sdk';
import css from './styles.css?inline';

export default class MyModule {
  readonly cleanup: Array<() => void> = [];
  constructor(private readonly ctx: Context) {}

  start(): void {
    cleanup.push(
	    this.ctx.registerCss(css),
	    // ... other registrations
	  )
  }

  dispose(): void {
    this.cleanup.splice(0).forEach((fn) => fn());
  }
}
```

`import css from 'path/to.css?inline';` is a feature supported by Tsdown and Vite to inline the CSS string directly in the final JavaScript bundle.

## Contribute to Sync Engine

Sync Engine welcomes any type of module ideas and contribution. Active contributors helps Sync Engine thrive. Refer to [contributing](../usage/contributing) for contributing requirements.
