# 参与 Sync Engine 贡献

Sync Engine 欢迎对插件核心、模块和文档的任何贡献，也欢迎 issue 和功能请求。

## Issue 政策

Sync Engine 仓库接受两类 issue：bug 报告和功能请求。

### Bug 报告

**Bug 报告的 issue 必须包含**：

- 清晰的描述和复现步骤
- 你正在使用的所有模块的列表
- 你使用的存储服务
- 同步过程中出现的 bug，请提供从 `开发` 设置导出的日志

**不得包含**：

- 关于你自己的任何敏感信息
- 多个 bug：请分开提交 issue
- 投机性的"根因"猜测或"修复方案"：如果你已经走到了这一步，你可能更想提交 pull request。

维护者已请求澄清 / 协同测试，但报告者未提供任何相关信息的 bug 报告，72 小时后关闭；报告者声称协同测试但没有提供后续信息的，同样在 72 小时后关闭。

### 功能请求

**功能请求包含**：

- 对该功能应如何工作的清晰描述
- （可选）你的实现想法，如果你愿意参与头脑风暴

功能请求是普通的 issue，但经过一些沟通后，维护者会把请求移到一个专门的 meta issue 中方便管理。

我们**强烈建议**你在提交功能请求之前，先尝试自己写一个 Sync Engine 模块来实现需求，因为 Sync Engine 的可扩展性很强，大多数功能都能用模块实现。Sync Engine 还提供官方 SDK、文档和 AI agent skill 来辅助模块开发。Sync Engine monorepo 中有大量模块示例。

## Fork 政策

Sync Engine 欢迎有利于 Sync Engine monorepo 发展的 fork。

但是，正如 [Obsidian 开发者政策](https://docs.obsidian.md/Developer+policies#Forks)所述，只要 Sync Engine 仓库保持活跃或维护者未允许，Sync Engine 禁止任何形式的恶意 fork，即把它作为另一个独立插件提交到 Obsidian 官方插件目录。维护者发现后会举报。

与其再造一个同步插件，我们强烈建议你开发一个 Sync Engine 模块。Sync Engine 核心高度优化且久经实战，它提供的便捷 SDK 让你自由定制而无需重复造轮子。

## 向 Monorepo 贡献代码

### Monorepo 如何运作

**技术栈**：

项目使用：

- **TypeScript 7** 作为编程语言
- **Bun** 作为包管理器和任务运行器
- **Turbo** 管理 monorepo
- **Tsdown** 负责构建
- **Oxlint 和 Bun fmt** 负责检查与格式化
- **VitePress** 搭建文档网站

插件核心使用：

- **Solid.js** 和 **TailwindCSS**（经 UnoCSS）构建 UI
- 自研包 **SynthKernel** 做依赖注入
- 自研包 **Uni-KV** 提供 IndexedDB 和内存数据库

**Monorepo 结构**：

```txt
Sync Engine Monorepo
├── docs          - Documentation website
├── blueprint     - Internal mechanisms
├── packages
│   ├── plugin    - Core plugin and SDK (@hesprs/sync-engine-sdk)
│   ├── shared    - Shared utilities (@repo/shared)
│   └── ...       - Others are all official modules
├── modules.json  - Official module source, records all official modules
└── tsconfig.json - TypeScript config for all packages
```

**命令**：

| 命令                              | 用途                         |
| --------------------------------- | ---------------------------- |
| `bun dev`                         | 构建且不清空 dist 文件夹     |
| `bun compile`                     | 构建并清空                   |
| `bun dev:plugin`                  | 构建插件，不清空 dist        |
| `bun build:plugin`                | 构建插件并清空               |
| `bun fix`                         | 格式化并修复可修复的检查错误 |
| `bun check`                       | 检查类型、lint 和格式        |
| `bun tests`                       | 运行所有测试                 |
| `bun <command> -F <package-name>` | 针对单个包运行命令           |

**CI/CD**：

CI 对每个 pull request 的提交运行，执行 `bun check` 和 `bun tests`。任何一项失败，pull request 都无法合并。

核心插件的发布由任意 tag push 触发。含连字符的 tag 触发预发布，不含连字符的 tag 触发正式发布。发布工作流会提取 `packages/plugin/CHANGELOG.md` 中对应的描述作为发布详情。

模块二进制文件与文档网站一起发布在 GitHub Pages 上（为什么？更好的 CDN 和更少的速率限制）。当文档目录或 `modules.json` 的变更被推送到 main 分支时，部署自动运行。

SDK 包发布到 npm，版本与插件保持一致。发布依赖手动触发工作流。

### 提交 Pull Request

你可以为调试或新功能提交 pull request。修复 bug 的 pull request 必须至少引用一个开放的 issue。

提交信息格式：`<title>(<scope>): <message>`。信息保持简洁，避免冗长的 "files changed" 或 ASCII 画。

如果你的贡献创建了新模块、包含复杂实现，或更改了核心 SDK API，则必须在 `docs` 目录中补充相关实现文档。

为方便维护者，审查交流使用英文。与 issue 相同，如果一个 pull request 未通过审查或 CI，且超过 72 小时没有任何有意义的变更，PR 将被关闭。

#### 模块贡献

如果你想贡献一个新模块，请把它做成 `packages` 下的一个包。模块的 `package.json` 至少要包含：

```json
{ "contributors": [{ "name": "<the-name-to-call-you>", "github": "<your-github-account-name>" }] }
```

然后修改仓库根目录的 `modules.json`，把你的模块加进去：

```json
[
  {
    "name": "Module Name",
    "id": "your-module",
    "icon": "puzzle",
    "description": "Description for your module",
    "version": "0.0.1",
    "main": "https://sync.consensia.cc/modules/module-name.js"
  }
]
```

PR 被接受后，你的模块会成为官方模块的一部分。之后关于该模块的 issue 和 pull request 也由你负责。

如果你的 pull request 包含对现有模块的实质性修改，也可以把你的信息加入 `contributors` 字段。

#### AI 贡献

提交 pull request 或 issue 时，请与维护者清晰沟通。如果你的文字表现出明显的 AI 痕迹（自信的错误断言、冗长而空洞的行话），维护者保留用 AI 生成的文本回复的权利。

Sync Engine 仓库总体上接受 AI 辅助的 pull request，模块方面尤其如此，只要它们：

- 通过 CI
- 通过审查
- 代码质量达到维护者可接受的标准
- 能够对后续维护保持负责

代码可以由 AI 编写；但提交 pull request 时，Sync Engine 要求作者必须是真实人类的 GitHub 账户。**公司 AI agent 实体的任何名称都不得出现在共同作者列表、提交信息和代码中。** 原因如下：

- 由 AI 完成的提交往往说明背后的人类缺乏足以承担后续维护的开发能力。
- 本仓库代码的版权属于对应的作者和贡献者，AI 共同署名会给代码归属带来歧义。
