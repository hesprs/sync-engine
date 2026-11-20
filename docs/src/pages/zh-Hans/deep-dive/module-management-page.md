# 模块管理页面

Sync Engine 用一个原生 Obsidian 设置页管理来自配置模块源的可执行模块。从[模块管理](../usage/settings#模块管理)打开。

## 页面布局

`ModuleManagement` 扩展 Obsidian 的 `SettingPage`。页面包含：

- 一个全宽搜索框；
- 一个图标按钮，打开的菜单带有 **Show installed only** 开关、**Install module from file**、**Install module from code** 和 **Refresh sources**；
- 一个 Solid.js 模块卡片网格。

模块源 URL 在 **Settings > Sync Engine > Development > Module sources** 中单独编辑。回到模块管理会创建新的源快照并刷新目录。

搜索框使用 Obsidian 的 `SearchComponent`。空查询按模块 ID 字母序排序模块。非空查询对模块名称和描述使用 `prepareFuzzySearch()`，然后按匹配分数和模块 ID 排序。

**Install module from file** 打开接受 `.js` 和 `.mjs` 文件的文件选择器；其他扩展名以通知拒绝。选中的文件会打开模块编辑器，元数据从文件的 magic bytes 预填，见[扩展性：从文件安装](./extensibility#install-from-file)。**Install module from code** 打开一个代码输入弹窗，用户粘贴模块代码，然后走相同的编辑器流程。

## 模块卡片

每张卡片显示模块图标、名称、版本、来源状态、描述和可用操作：

- **Download** 安装未安装或声明版本更新的模块。
- **README** 在元数据提供时打开模块的 README 页面。
- **Edit** 打开模块元数据和完整性设置。
- **Delete** 移除已安装的模块及其存储的元数据。
- **Enable** 存入 `enabled: true` 并加载模块。
- **Disable** 卸载模块并存入 `enabled: false`。

同一模块的另一个操作正在运行时，操作按钮禁用。运行中的操作显示进度图标。模块卡片按模块 ID 合并，已安装的元数据优先于源元数据。

## 来源与兼容性状态

`fetchSources()` 读取每个配置的源。源响应会被缓存用于自动更新检查。**Refresh sources** 菜单项强制刷新，并显示带已发现模块数和源数的通知。源内部重复的 ID 会被忽略。

如果源条目声明的 `minPluginVersion` 新于运行中的插件，目录会把插件标记为过期。安装需要更新版本的模块前，先更新 Sync Engine。

新下载的模块默认禁用。自动更新只作用于已安装且记录的源 URL 与声明的源 URL 一致的模块。
