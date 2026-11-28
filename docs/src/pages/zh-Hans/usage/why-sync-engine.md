# Sync Engine 是什么

**Sync Engine** 是一个可以用模块扩展的 Obsidian 同步插件：只安装你需要的部分，笔记就能在你的设备之间保持同步。Sync Engine 核心经过数月的人工迭代和实战检验，可靠且高度优化。

实际使用中，你选择一个存储后端（例如你自己的 WebDAV 服务器），按需加入加密等高级功能，然后按下"同步"。你不用配置用不到的功能，也不会携带永远连不上的服务的代码。无论后端是什么，同步都保持快速和可靠。

**Sync Engine 由真实的人类维护者负责**。虽然 Sync Engine 接受 AI 辅助的模块贡献，但 Sync Engine 核心（插件本身）严格由人类编写，拒绝任何"氛围编程"。它由许多巧妙而 AI 无法复刻的工程创新组成。

## 类似的选择

同步一个 Obsidian 仓库有几种方式：

- **[Obsidian Sync](https://obsidian.md/sync)** 是官方的零配置方案。如果你想一分钟内用上同步、又不介意月费，从它开始。
- **[Remotely Save](https://github.com/remotely-save/remotely-save)** 支持多种后端（S3、Dropbox、OneDrive、WebDAV），但按需付费，开发已停滞多年且存在稳定性问题。
- **[Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync)** 和 **[Fast Note Sync](https://github.com/haierkeys/obsidian-fast-note-sync)** 提供基于服务器的实时同步。如果你愿意搭建自己的服务器，它们工作得很好。
- **[Relay](https://github.com/No-Instructions/Relay)** 是托管的中继服务。方便，但你的笔记要经过你无法控制的基础设施。

Sync Engine 填补的空档是：你想自己选择存储；你希望插件保持轻量，用不到的功能不被打包进来；你想要高度优化的同步，不比自建服务器慢。

## 功能

Sync Engine 核心提供保证扩展性和性能所需的必要功能：

### 核心功能

- 启动 / 定时 / 焦点同步 / 保存即同步。
- 用 Glob 规则配置细粒度的同步策略（双向同步 / 镜像远程 / 镜像本地 / 不同步）。
- 冲突解决策略（重命名并保留两者 / 保留最新修改 / 保留远程 / 保留本地 / 跳过）。
- 速率 / 内存控制选项。
- 同步文件的创建 / 修改时间。
- 自定义请求头。
- 以上大部分功能都可以通过编写模块来扩展。

### 可扩展架构

- 你可以在自定义模块中添加后端、优化器、同步触发器、i18n 资源、决策策略、冲突策略、设置项和自定义文件处理，并调用一切可用的操作。
- 官方提供文档、AI agent skill 和带调试与测试工具的 SDK。
- 插件提供专门的模块发现与管理界面。
- 仓库接受任何遵守[贡献指南](./contributing)的模块贡献。

### 激进优化

- 增量同步从不每次上传整个仓库。
- [锚定非对称存储](../deep-dive/asymmetric-storage)技术大幅加快同步。
- 实时同步使用缓存的远端状态，可以在毫秒内完成。
- [基准测试显示日常同步比 Remotely Save 快约 **100 倍**](./benchmark)。
- 顺畅处理拥有数千个文件的仓库。
- 高度优化的核心同步时序不浪费一毫秒。
- 可扩展的优化器插槽确保每个请求都针对你自己的服务做了优化。
- 详细的性能对比见[性能基准测试](./benchmark)。

### 可用模块

**后端**：

- [WebDAV](../deep-dive/modules/webdav)：标准 WebDAV 协议实现，兼容性久经实战。支持任何提供合规 WebDAV API 的后端。
- [S3](../deep-dive/modules/s3)：Amazon S3 与 S3 兼容对象存储，带优化的批量删除。
- [Google Drive](../deep-dive/modules/gdrive)：Google Drive 存储，带优化的授权流程。
- [Dropbox](../deep-dive/modules/dropbox)：Dropbox 存储，带优化的授权流程和批量远端操作。

**功能**：

- [加密](../deep-dive/modules/encryption)：精心设计的加密，为跨后端同步特别强化了安全性。
- [智能合并](../deep-dive/modules/smart-merge)：由递归三方合并驱动的冲突解决策略。

**翻译**：

- 原生英语
- I18n 简体中文
- I18n 繁體中文
- I18n Русский

## 用法

开始使用 Sync Engine 很简单：

1. 从 Obsidian 插件商店下载并启用 `Sync Engine`。
2. 打开"模块管理"页面，安装需要的翻译、后端和可选功能。
3. 在设置界面填写云服务的必要信息。
4. 从命令面板或侧边栏按钮开始你的第一次同步。
5. 审查将要执行的同步任务。
6. 点击"确认"，你的文件将以光速到达配置的后端。
7. 在你的其他设备上安装 Sync Engine，并按第一台设备的方式配置。
8. 如果一切正常，每次同步运行都会自动发现本地与远端的变更，并在两者之间同步文件。

::: tip

Sync Engine 要求最低 Obsidian v1.13.0。Android 或 iOS 设备的门槛是 Android System Webview 98 或 iOS 15.4。低于这些阈值的设备无法正常工作。

:::

## 开发

如果你认为 Sync Engine 的基础功能不能满足需求、想要自定义，我们建议你开发一个 Sync Engine 模块，而不是另起一个插件：

1. Sync Engine 高度优化且久经实战，在它之上开发可以为你节省大量测试和调试时间。
2. Sync Engine 提供官方 SDK 和清晰的文档，核心已有成熟的同步抽象，你不需要重复造轮子。
3. Sync Engine 的模块生态有乘数效应，你可以一边使用其他模块的功能，一边实现自己的功能，而不是把所有功能写进一个巨大的单体插件。

关于如何开发模块，见[开发文档](../development/develop-a-module)。想向官方仓库贡献的话，见[贡献标准](./contributing)。
