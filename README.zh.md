<h1 align="center">
    <img src="./docs/public/logo.svg" alt="Sync Engine 图标" width="280px">
    <br />
    Sync Engine
    <br />
</h1>

<h4 align="center">可扩展的 Vault 同步引擎：快速 · 免费 · 可靠</h4>

<p align="center">
    <a href="https://github.com/hesprs/sync-engine/releases/latest">
        <img src="https://img.shields.io/github/downloads/hesprs/sync-engine/manifest.json.svg?label=%E2%AC%87%20%E4%B8%8B%E8%BD%BD%E9%87%8F&labelColor=008811&color=333333&displayAssetName=false" alt="累计下载量">
    </a>
    <a href="https://community.obsidian.md/plugins/sync-engine">
        <img src="https://img.shields.io/badge/%EF%B8%8F%E6%8F%92%E4%BB%B6-%E5%B9%B3%E5%8F%B0%E5%B7%B2%E6%89%AB%E6%8F%8F-333333?logo=obsidian&logoColor=white&labelColor=a079ff" alt="插件安全扫描">
    </a>
    <a href="https://github.com/hesprs/sync-engine/actions">
        <img src="https://img.shields.io/github/actions/workflow/status/hesprs/sync-engine/ci.yml?logo=github&logoColor=white&label=CI&labelColor=d4ab00&color=333333" alt="持续集成状态">
    </a>
    <a href="https://sync.consensia.cc">
        <img src="https://img.shields.io/badge/%E6%96%87%E6%A1%A3-%E5%B7%B2%E5%B0%B1%E7%BA%AA-333333?labelColor=5C73E7&logo=vitepress&logoColor=white" alt="官方文档" />
    </a>
    <img src="https://img.shields.io/badge/%E7%B1%BB%E5%9E%8B-%E4%B8%B5%E5%AF%86-333333?logo=typescript&labelColor=blue&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/%F0%9F%96%90%EF%B8%8F%20%E4%BA%BA%E7%B1%BB%E4%B9%8B%E4%BD%9C-333333?labelColor=15C2C0" alt="人类用心打造">
    <a href="https://www.npmjs.com/package/@hesprs/sync-engine-sdk">
        <img src="https://img.shields.io/npm/v/@hesprs/sync-engine-sdk?logo=npm&labelColor=red&logoColor=white&color=333333" alt="npm">
    </a>
    <img src="https://img.shields.io/github/stars/hesprs/sync-engine" alt="GitHub 标星数量">
</p>

<p align="center">
    <a href="https://github.com/hesprs/synthkernel">
        <img src="https://github.com/hesprs/synthkernel/raw/refs/heads/main/assets/powered-by-synthkernel.svg" width="200px" alt="由 SynthKernel 驱动"></img>
    </a>
</p>

<p align="center">
    <a href="./README.zh.md">
        <strong>简体中文</strong>
    </a> • 
    <a href="https://sync.consensia.cc">
        <strong>文档指南</strong>
    </a> • 
    <a href="https://community.obsidian.md/plugins/sync-engine">
        <strong>插件市场</strong>
    </a>
</p>

## 简介

Sync Engine 是一款用于**多设备间同步 Vault 笔记文件**的插件，主要支持：

**存储后端**：[S3](https://sync.consensia.cc/deep-dive/modules/s3)、[WebDAV](https://sync.consensia.cc/deep-dive/modules/webdav)、[Google Drive](https://sync.consensia.cc/deep-dive/modules/gdrive)<br>
**核心特性**：

- [客户端端到端加密](https://sync.consensia.cc/deep-dive/modules/encryption)
- 支持双向同步、镜像远端、镜像本地等多种模式。
- 支持启动时同步、定时同步以及变更自动保存时同步。
- 灵活的冲突解决方案（[智能合并](https://sync.consensia.cc/deep-dive/modules/smart-merge)、保留两者、保留最新版、覆盖为远端、覆盖为本地、直接跳过）。
- 速率与内存占用调优选项。
- 自定义请求头设置。

Sync Engine 还是一个**模块化扩展平台**。得益于[便捷的 SDK 支持](https://sync.consensia.cc/development/develop-a-module)，无需修改任何插件源码，任何人都能自主[构建专属模块](https://sync.consensia.cc/development/develop-a-module)来扩展功能，或[为社区贡献新特性](https://sync.consensia.cc/usage/contributing)。

欢迎访问使用文档网站 [`sync.consensia.cc`](https://sync.consensia.cc)，获取详细的使用指南、现有模块列表、权限说明、性能基测报告以及模块开发文档。

目前社区已有不少优秀的跨设备笔记同步插件：

- [Remotely Save](https://github.com/remotely-save/remotely-save) 支持包括 S3、Dropbox、OneDrive、WebDAV 在内的多种后端。但部分功能收费，且已停更多年，存在一定稳定性问题。
- [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) 与 [Fast Note Sync](https://github.com/haierkeys/obsidian-fast-note-sync) 提供了基于自建服务器的实时同步体验。如果您擅长搭建与维护服务器，它们会是不错的选择。
- [Relay](https://github.com/No-Instructions/Relay) 是一种托管中继服务。虽然开箱即用，但笔记数据会经过不受您掌控的第三方设施。

Sync Engine 正好填补了这一空白：让您自由选择存储服务；插件本体轻巧精干、绝不动辄打包无用功能；同时具备深度优化的同步性能，传输速度媲美自建服务器。

## 特色

### 极速

- 采用增量同步机制，无需每次重复上传整个 Vault。
- [锚定非对称存储](https://sync.consensia.cc/deep-dive/asymmetric-storage)技术大幅提升同步效率。
- 实时同步依靠本地缓存的远端状态，毫秒间即可完成状态校验。
- [基准测试表明，部分指标超越 Remotely Save 近 **100 倍**](https://sync.consensia.cc/usage/benchmark)。
- 面对包含数万文件的庞大 Vault 依然从容高效。
- 同步性能不亚于自建专用服务器。
- 详细的数据对比请参阅[性能基测试报告](https://sync.consensia.cc/usage/benchmark)。

### 免费且可靠

- 完全开源，遵循 [MIT 开源协议](https://mit-license.org/)，可免费使用及分发。
- 包括插件核心、全部模块及文档网站在内的所有源码均在开源仓库中公开呈现，并通过了 Obsidian 官方的自动化安全扫描。无任何隐蔽的数据埋点或第三方服务器依赖。
- [官方文档](https://sync.consensia.cc)对所有细节做了透明交代，包含详细的[权限调阅](https://sync.consensia.cc/usage/permissions)与[安全说明](https://sync.consensia.cc/usage/security)。
- 内置多重防护机制保障安全：[数据加密](https://sync.consensia.cc/deep-dive/modules/encryption)、[模块签名验证](https://sync.consensia.cc/deep-dive/extensibility)。
- [同步算法](https://sync.consensia.cc/deep-dive/sync)经过海量实际使用场景的考验与演进打磨，稳定可靠。

### 高度可扩展

- 您可以自由扩充后端适配器、性能优化器、同步触发器、多语言国际化资源、决策策略、冲突解决方案、自定义设置项以及文件处理管道，甚至在自定义模块中调用所有底层 API。
- 提供完善的开发文档以及附带调试测试工具包的 SDK。
- 插件内建了专属的模块发现与管理界面。
- 只要符合[贡献指南](./CONTRIBUTING.md)，开源仓库非常欢迎任何形式的模块贡献。

## 使用方法

1. 从 Obsidian 插件市场搜索下载并启用 `Sync Engine`。
2. 打开“模块管理”设置，按需安装语言包、存储后端及可选扩展功能。
3. 在设置界面填入您云存储服务的相关配置信息。
4. 通过命令面板或侧边栏按钮发起首次同步。
5. 预览即将执行的同步任务清单。
6. 点击“确认”，您的文件便会以极快速度同步至目标后端。
7. 查阅[官方文档](https://sync.consensia.cc)以解锁更多高级用法。

## 路线图

以下是规划中的特性与改进列表。关注与标星 ⭐ 的用户越多，开发推进速度就越快。同时，也非常欢迎广大开发者加入我们，共同参与模块或插件核心的开发。

- [x] 3.0 版本：全盘重构、支持动态模块加载、上线模块商店、引入非对称存储，并完成品牌全新升级
- [x] 3.1 版本：设置项全面适配 Obsidian 1.13 版本新 API
- [ ] 3.2 版本：精细化同步策略选择，基于排序 Glob 匹配规则重构文件包含与排除机制

Sync Engine 设立了[功能需求清单](https://github.com/hesprs/sync-engine/issues/214)，欢迎为您期待的特性点赞 👍 投票。得票越高的功能将获得更高的开发优先级。

## 常见问题

<details><summary>同步过程中遇到报错该怎么办？</summary>

您可以直接尝试重新发起同步。偶发的错误既不会阻断后续同步，也不会损坏您的笔记文件。

如果重试后问题依然存在，请[提交新的 Issue](https://github.com/hesprs/sync-engine/issues/new)，附上运行日志并详细描述错误现象与您的配置环境。

</details>

<details><summary>使用本插件时，该如何管理远端存储空间？</summary>

根据本插件的[文件处理策略](https://hesprs.github.io/projects/sync-engine#technical-breakdown)，所有远端变更都会同步映射到各个本地 Vault 中。因此，除非您明确计划手动新增或删减文件，否则通常不建议直接手动修改远端存储内容。尤其在开启了加密或非对称存储功能时，更应避免手动干预远端。

</details>

## 开源协议

本仓库中的 Sync Engine 源码及相关模块均采用 [MIT 开源协议](https://mit-license.org/) 授权。<br>
文档网站的内容页面采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 授权。

版权所有 ©️ 2026 Hēsperus 及全体贡献者