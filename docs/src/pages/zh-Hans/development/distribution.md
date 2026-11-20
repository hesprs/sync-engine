# 分发

模块以单个 JavaScript 文件的形式分发，托管在 web 服务器上。本页介绍模块源模式和发布工作流。内部的扩展性架构（信任模型、加载生命周期、完整性验证）见[深入解析：扩展性](../deep-dive/extensibility)。

## 模块源模式

一个 JSON 数组，每个条目描述一个模块：

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

插件校验全部六个必填字段（`name`、`version`、`description`、`main`、`integrity`、`id`），缺少任何一个都会拒绝该条目。`integrity` 必须是模块源码字符串的 SHA256 哈希得到的 64 位十六进制字符串。

:::

`id` 字段不能包含 `< > : " / \ | ? *`。`name` 没有字符限制。

## Magic bytes

模块元数据通过两条渠道到达用户：

- **源元数据**：模块从模块源下载时，源 JSON 中的条目是权威的，下载文件中的 magic bytes 会被忽略。
- **Magic bytes**：用户通过 **Install module from file** 从本地文件安装模块时，不存在源 JSON。Sync Engine 解析文件顶部的 `/*! ... */` 注释，用它预填模块编辑器。元数据在存储前由用户审查并确认。

因此，用 [Tsdown 插件](./develop-a-module#magic-bytes)在构建期嵌入 magic bytes，主要对以独立文件分发的模块有用。如果模块通过模块源分发，把元数据放在源 JSON 中即可，magic bytes 可以完全省略。

## 模块源

插件从设置中存储的 URL 读取模块源：

```ts
moduleSources: ['https://sync.consensia.cc/modules.json'];
```

用户可以在["模块源"设置](../usage/settings#模块源)中增删源 URL。任何提供合法 JSON 源的 HTTP(S) URL 都可以使用。

## 本地存储

模块存储在 `<vault>/.obsidian/plugins/sync-engine/modules/<id>.js`。

版本和元数据持久化在 IndexedDB（`AugmentedModuleMeta`）中。细节见[深入解析：扩展性](../deep-dive/extensibility#local-module-storage)。

## 自动更新

启用 `Auto update modules` 后，插件在加载时：

1. 等待 500 毫秒。
2. 获取所有配置的模块源 URL。
3. 对每个已安装模块，比较远端版本与本地版本。
4. 远端版本更新时，排队一个下载。
5. 等待 sync engine 空闲，然后下载并替换模块文件。

设备报告离线时跳过更新检查。

只有已安装的模块会被自动更新。新模块必须通过模块管理界面手动安装。

## 发布一个模块

对不属于官方 monorepo 的模块：

1. 把模块构建为单个带 `integrity`（SHA-256 哈希）的 `.js` 文件。
2. 在稳定的 URL 托管模块源 JSON 文件（例如 `https://my-modules.example.com/modules.json`）。
3. 在每个模块 `main` 字段指定的 URL 托管它的 `.js` 文件。
4. 任何静态托管都可以：JsDelivr、GitHub Releases、Cloudflare Pages 等。
5. 用户在 **Settings > Sync Engine > Development > Module sources** 添加你的模块源 URL。

如果你认为你的模块能让更多人受益，强烈建议把它贡献到 Sync Engine monorepo，见[贡献指南](../usage/contributing#模块贡献)。

### 用 `sha256` 计算 `integrity`

`ModuleMeta` 的 `integrity` 字段是模块源码字符串的 64 位十六进制 SHA-256 哈希。使用 `@hesprs/sync-engine-sdk/dev` 导出的 `sha256` 工具计算：

```ts
import { sha256 } from '@hesprs/sync-engine-sdk/dev';

const source = await Bun.file('./dist/my-module.js').text();
const integrity = await sha256(source);
// → "a1b2c3d4..." (64 hex characters)
```

```ts
function sha256(input: string): Promise<string>;
```

它是一个 dev 导出（来自 `sdk/dev.ts`），因为模块完整性在构建期计算，而不是运行时。Sync Engine 内部验证完整性用的就是同一个函数。
