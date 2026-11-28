# 扩展性契约

Sync Engine 通过在运行时导入 JavaScript 文件来加载模块。模块是可执行代码，加载模块就是**动态代码执行**。插件实现了一系列措施来压缩攻击面。

## 信任模型

模块系统信任：

- 本地操作系统、Obsidian 运行时、vault 适配器、内存和密钥存储
- 作为传输层的 TLS
- 官方模块源及其托管的产物
- 用户明确下载的模块及其后续更新
- 用户明确添加的模块源

加载器防范：

- 没有既有记录证明用户批准的模块文件不会被自动加载
- 导入之前，模块文件必须匹配其记录的 SHA-256 值，除非用户显式关闭该检查
- 被攻破的自定义源无法干扰已有模块

## 模块源

模块源 URL 存储在 `settings.moduleSources`。默认源是 `https://sync.consensia.cc/modules.json`，这是托管在 GitHub Pages 上的官方源，完全透明。

Sync Engine 官方托管一个备用源 `https://raw.githubusercontent.com/hesprs/sync-engine/refs/heads/gh-pages/modules-alternative.json`。这个源与主源完全相同，只是把所有 `sync.consensia.cc` 替换为 `hesprs.github.io/sync-engine`。当你的防火墙把 `sync.consensia.cc` 标记为不安全时，使用这个源。

::: warning

请避免同时使用两个源。如果你决定使用 `https://raw.githubusercontent.com/hesprs/sync-engine/refs/heads/gh-pages/modules-alternative.json`，请在源列表中删除 `https://sync.consensia.cc/modules.json`。

:::

[用户在设置页面中添加和移除源 URL](../usage/settings#模块源)。该页面接受 `http:` 和 `https:` URL。模块源尽量使用 HTTPS。

插件用 Obsidian 的 `requestUrl()` 获取每个配置的源。源必须包含一个 JSON 数组。每个被接受的条目必须包含以下字符串值：

```TypeScript
type ModuleMeta = {
	id: string;
	name: string;
	version: string;
	description: string;
	main: string; // Download link
	icon?: string;
	minPluginVersion?: string;
	readme?: string;
	integrity: string;
};
```

可选的 `icon`、`minPluginVersion` 和 `readme` 值同样受支持。要求更新版插件的条目在目录中保持可见，并把插件标记为过期；安装这些模块前先更新插件。包含常见文件名分隔符或元字符的 ID 会被跳过，integrity 字符串必须包含 64 个十六进制字符。

源内容会在当前插件生命周期内缓存，用于自动更新检查。重复的 ID 在每个源内部被过滤。

源条目同时提供模块下载 URL（`main`）和期望的 integrity 值。

## 本地模块存储

模块产物存储在 `<vault config directory>/plugins/sync-engine/modules/<id>.js`。模块目录位于 Obsidian 的插件配置目录内。新安装会明确排除这个模块目录以及整个仓库配置目录，不参与同步。

已安装模块的元数据存储在一个 IndexedDB store 中，store 名称由仓库名派生：`modules-<hash of vault name>`，因此常见的攻击手段（例如被攻破的同步后端）无法随意修改模块元数据。

存储的元数据在源元数据之上扩展了：

```ts
type AugmentedModuleMeta = ModuleMeta & { enabled: boolean; source: string; icon: string };
```

模块加载使用的 `enabled` 值就存在这条本地模块记录里。

## 启动加载

启动加载执行以下步骤：

1. 模块目录不存在时创建它。
2. 列出模块目录下的文件和文件夹。
3. 移除不以 `.js` 结尾的文件夹和文件。
4. 把每个 JavaScript 文件名解析为模块 ID。
5. 把每个文件与本地 IndexedDB 存储中的元数据匹配。
6. 自动安装没有存储元数据的文件。
7. 只有存储元数据为 `enabled: true` 的模块才会加载。

没有存储元数据的文件会被自动安装。元数据从文件的 magic bytes 推导，缺失字段使用默认值，integrity 值从文件计算，模块默认禁用。它在用户启用之前不会被加载，之后可以在[模块管理界面](./module-management-page)中编辑或删除。

加载已安装的产物时，加载器通过 vault 的 `DataAdapter` 读取它。下载过程中，它可能改为直接验证获取到的响应文本。完整性检查未被用户禁用时，它对模块文本计算 SHA-256，并与存储值比较。

模块被转换为 JavaScript `Blob`，只有通过检查后才动态导入。默认导出不是函数（类构造器）时被拒绝。

完整性验证有这些性质：

- 它能检测模块文件在 integrity 值记录之后被修改。
- 它能检测已下载模块文本与元数据之间的不匹配，适用于已启用模块被立即加载的情况。
- 对未知的本地模块，可以通过模块编辑器关闭它。这需要用户显式配置。

## 下载与更新生命周期

### 显式下载

模块管理界面为未安装或声明版本更新的模块提供下载操作。该操作：

1. 请求 `main` URL；
2. 把响应读为文本；
3. 把文本写入 `<id>.js`；
4. 把提供的元数据存入 IndexedDB；
5. 模块已在运行或被标记为启用时立即加载。

新模块默认禁用。立即加载发生时，下载文本在导入前做完整性检查。新下载的禁用模块只写入和存储，不导入；完整性在之后启用模块时检查。

### 从文件安装

模块管理菜单还提供 **从文件安装模块**。用户选择一个 `.js` 或 `.mjs` 文件（其他扩展名以通知拒绝）。`installModuleFromCode()` 从文件的 magic bytes 推导元数据，即在构建期嵌入的、位于文件开头的 `key: value` 行形式的 `/*! ... */` 注释，把文件写入模块目录，存储元数据，并在模块启用时加载。这条路径不涉及任何模块源。

### 从代码安装

模块管理菜单还提供 **从代码安装模块**。用户把模块代码粘贴进代码输入弹窗。`installModuleFromCode()` 从代码的 magic bytes 推导元数据，把代码写入模块目录，存储元数据，并在模块启用时加载。这条路径不涉及任何模块源。

### 自动更新

自动更新启用时，加载器在短暂延迟后安排一次更新检查。

只有满足以下条件时才会选中一个声明的更新：

- 它的 ID 匹配一个已安装模块；
- 它的源 URL 与已安装记录的源 URL 完全相等；
- 它的版本比较结果大于已安装版本。

更新随后走正常的下载路径。正在运行或标记为启用的模块会从新下载的文本卸载并重新加载。新模块永远不会被自动发现启用。

通过模块编辑器更改模块的源会改变存储的源元数据，这是一个用户操作。由于源 URL 严格比较，另一个配置的源不能自动更新已有模块。

## 启用与卸载

模块管理界面提供启用 / 禁用开关。启用把 `enabled: true` 存入本地模块元数据并加载模块。禁用卸载模块并存入 `enabled: false`。

加载失败时，已启用的模块在本地模块存储中被标记为禁用，并显示通知。加载失败包括完整性不匹配、无效的模块导出和导入错误。

卸载调用模块可选的 `dispose()` 方法，并从已加载模块的映射中移除构造器。注册清理是协作式的：模块应在 `dispose()` 中调用注册 API 返回的清理回调。

## 运行时权限

模块接收合并后的 Sync Engine Context。Context 包含活跃的 Obsidian `app` 对象和模块 API。插件还通过 `syncEngineApiBridge` 暴露完整的导入版 Obsidian 命名空间；SDK 构建把模块从 `obsidian` 的导入重写为这个桥。

已注册的模块 API 包括：

- 全仓库的本地文件系统访问
- 远端文件系统创建和包装器
- 请求创建和请求中间件注册
- 设置访问
- 后端、解决器、优化器、列表器、设置和 CSS 的能力注册表
- SynthKernel 模块管理辅助函数和共享的 `allModules` 集合

这些权限对受信任的模块是有意为之。这与 Obsidian 给用户下载并启用的插件完整 API 访问是一回事。
