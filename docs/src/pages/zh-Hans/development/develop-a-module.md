# 编写一个 Sync Engine 模块

模块让你在 Sync Engine 基础功能之外获得无限的扩展。本文覆盖编写、构建、测试和发布一个模块所需的全部内容。

## 搭建模块项目

开发一个 Sync Engine 模块，至少需要一个 JavaScript 运行时和一个包管理器，例如 `Bun`，或 `Node.js` + `npm`/`pnpm`。

创建项目文件夹并运行以下命令。任何包管理器都可以，本文以 `Bun` 为例：

```sh
bun init -y
bun add -D @hesprs/sync-engine-sdk tsdown
```

`@hesprs/sync-engine-sdk` 是 Sync Engine 模块的官方 SDK。Tsdown 是推荐的打包器。

::: tip

如果模块需要使用 Obsidian API，可以添加：

```sh
bun add obsidian
```

:::

接下来填充项目结构。一个典型的 Sync Engine 模块结构如下：

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

创建 `tsdown.config.ts`，写入以下内容：

```TypeScript
import syncEngineModule from '@hesprs/sync-engine-sdk/tsdown-plugin';
import { defineConfig } from 'tsdown';

export default defineConfig({
	clean: process.env.MODE !== 'dev',
	dts: false,
	entry: { 'your-module-id': 'src/index.ts' },
	minify: true,
	outExtensions: () => ({ js: '.js' }),
	outputOptions: { codeSplitting: false },
	platform: 'browser',
	plugins: [syncEngineModule()],
});
```

这份配置让 Tsdown 输出单个压缩的 JavaScript 文件，Sync Engine 核心可以直接加载它。`syncEngineModule` 插件负责桥接 Obsidian API 导入，还可以把模块元数据嵌入为 magic bytes，见 [Tsdown 插件](#tsdown-插件)。`platform: 'browser'` 面向在 Obsidian 渲染器中加载模块的浏览器运行时。

最后在 `package.json` 中添加以下命令：

```json
{ "scripts": { "dev": "MODE=dev tsdown", "build": "tsdown" } }
```

## Tsdown 插件

`@hesprs/sync-engine-sdk/tsdown-plugin` 提供的 `syncEngineModule` 插件在构建模块时处理两件事。

### Obsidian API 桥接

它把输出中所有形式的 `obsidian` 导入重写为运行时 API 桥，模块代码可以直接导入 Obsidian API，同时仍以普通 ESM 文件加载：

```TypeScript
import { Notice, Setting } from 'obsidian';

// Compiled to:
const { Notice, Setting } = window.syncEngineApiBridge;
```

### Magic bytes

把模块元数据传给插件后，每个编译产物入口文件的开头会插入一段 magic bytes 注释：

```TypeScript
plugins: [
	syncEngineModule({
		id: 'my-module',
		name: 'My Module',
		icon: 'puzzle',
		description: 'An example module.',
		source: 'https://example.com/modules.json',
		version: '1.0.0',
		readme: 'https://example.com/my-module',
	}),
],
```

输出文件的开头变为：

```js
/*!
id: my-module
name: My Module
icon: puzzle
description: An example module.
source: https://example.com/modules.json
version: 1.0.0
readme: https://example.com/my-module
*/
```

元数据也可以是 `{ id, ...meta }` 的数组，或以入口名为键的记录，为多入口构建中的每个入口分配不同的元数据。所有字段都是可选的，省略的字段不产生行，没有匹配的入口不产生注释。

用户从本地文件安装模块时，Sync Engine 会解析这段注释来推导模块元数据。magic bytes 与源元数据各自的生效时机见[分发](./distribution#magic-bytes)。

## 模块契约

一个 Sync Engine 模块是一个普通的 JavaScript ESM 文件，默认导出一个类。该类在构造函数中接收 `Context` 注入，提供设置，并在生命周期中注册能力。一个最小的 `index.ts` 大致如下：

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

每个模块：

1. **默认导出** 一个模块类
2. 接受一个以 `Context` 为类型的**单一构造参数**（`register*` API 见[注册](./registration)，完整成员列表见[其他](./miscellaneous)）
3. 可选地声明带默认值的 `readonly moduleSettings` 属性
4. 可选地实现 `start()` 来注册能力并开始活动，该方法在模块加载时执行
5. 可选地实现 `dispose()` 来清理，该方法在模块卸载时执行

::: tip

- 模块可以使用 Node.js 和浏览器 API，但如果需要移动端兼容，请避免使用 Node.js API。
- 所有 UI 文本使用 **Sentence case**，这是 Obsidian 的标准。
- 通过 `obsidian` 导入直接访问 **Obsidian API**（`syncEngineModule` 会优雅地桥接它）。
- 先注册 i18n 资源，让后续注册可以使用它们。
- 卸载时注销所有注册过的能力。

:::

Sync Engine monorepo 中有大量模块示例：

- [加密](https://github.com/hesprs/sync-engine/tree/main/packages/encryption)：使用设置、i18n、文件系统和内存数据库 API。
- [智能合并](https://github.com/hesprs/sync-engine/tree/main/packages/smart-merge)：使用设置、i18n、文件系统、IndexedDB 和冲突解决 API。
- [WebDAV](https://github.com/hesprs/sync-engine/tree/main/packages/webdav)：如何给 Sync Engine 添加后端的极好示例。

## 建立反馈回路

我们建议创建一个符号链接，从 Sync Engine 的 `modules/` 文件夹指向你的模块 `dist/` 文件夹：

```sh
ln -s /path/to/your/vault/.obsidian/plugins/sync-engine/modules /path/to/your/project/dist
```

回顾 Tsdown 配置和 `package.json` 中的以下内容：

```TypeScript
export default defineConfig({ clean: process.env.MODE !== 'dev' });
```

```json
{ "dev": "MODE=dev tsdown" }
```

所以只要运行 `bun dev`，你的模块就会在正确的文件夹里重建，且不会清空其他模块。

重建之后，需要在模块管理界面中重载模块才能应用最新改动。也可以使用 [Hot Reload](https://github.com/pjeby/hot-reload) 插件在每次构建后重载 Sync Engine，你的模块也会随之重载。

为了在不触发完整性保护的情况下可靠地重载 Sync Engine 模块，需要在[模块管理页面](../deep-dive/module-management-page)的模块编辑器界面中手动关闭完整性验证。确保只对你正在开发的模块关闭验证，安全影响见[安全](../usage/security)。

## 在模块中加载 CSS

Sync Engine 允许模块携带自定义 CSS。

首先添加 Tsdown CSS 包，让它能处理 CSS 文件：

```sh
bun add -D @tsdown/css
```

创建 CSS 文件，并在模块中动态加载内联的 CSS：

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

`import css from 'path/to.css?inline';` 是 Tsdown 和 Vite 支持的特性，把 CSS 字符串直接内联进最终的 JavaScript 产物。

## 参与 Sync Engine 贡献

Sync Engine 欢迎任何类型的模块想法和贡献。活跃的贡献者让 Sync Engine 茁壮成长。贡献要求见[贡献指南](../usage/contributing)。
