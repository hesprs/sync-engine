# Google Drive 模块

Google Drive 模块注册 `gdrive` 远端文件系统。它把仓库存储在一个 Google Drive 文件夹中，通过 Google Drive 公开 API 执行文件操作。模块使用 Google OAuth 认证，不使用第三方服务器或代理。

## 设置

模块添加一个 **Google Drive** 设置分组。在选择 Google Drive 作为远端文件系统之前，先配置这些设置：

### 连接账户 / 账户已连接

这个设置发起 Google 授权流程。授权后，模块把刷新令牌安全地存入 Obsidian 的密钥存储，并按需用它换取短期访问令牌。**Disconnect** 选项向 Google 撤销令牌、把它从密钥存储移除、清除所有缓存的访问令牌，并删除存储的账户标识。

::: warning

连接 Google Drive 账户会在 **Obsidian 钥匙串中创建一个名为 `sync-engine-gdrive-refresh-token` 的新密钥**。这个密钥完全由 Sync Engine 管理，用作换取 Google Drive 访问令牌的刷新令牌。请勿将它用于其他用途。

:::

### 基目录

这定义 Google Drive 中作为该仓库根目录的文件夹。该值按目录路径规范化。模块启动时留空则默认为 `<仓库名>/`。指定的文件夹在第一次同步时自动创建。

::: warning

基目录是一个由应用管理的命名空间。模块只能看到并操作它通过自己的 Google Drive 集成创建的文件。在 Drive 中手动创建的文件或文件夹、或其他应用创建的文件或文件夹，即使位于配置的基目录内，对这个模块也不可见。它们不会被导入、同步或列出。请不要在这个 Drive 文件夹中手动创建、重命名、移动或维护仓库文件。

这是 Google 的 `drive.file` 权限范围带来的结果。模块被有意限制，不授予完整 Drive 访问权限。

:::

### 删除到垃圾桶

启用时，远端删除的文件被移入 Google Drive 垃圾桶而不是永久移除。禁用时，被删除的文件立即永久清除。注意 Google Drive 通常在 30 天后清空垃圾桶中的条目。

## 认证流程

模块使用 [**Google OAuth 2.0 for TV and Limited-Input Device Applications**](https://developers.google.com/identity/protocols/oauth2/limited-input-device)：

1. 点击 **Connect** 时，模块向 Google 的设备授权端点请求设备码。
2. Obsidian 显示 Google 的验证 URL 和一次性用户码。模块可以复制该码并在浏览器中打开 URL。
3. 你在该浏览器中登录 Google 并批准请求的访问。授权时请记得勾选以下选项：

![tick "See, edit, create, and delete only the specific Google Drive files you use with this app." when authorizing Google Drive](https://img1.tucang.cc/api/image/show/6d34bcb968f679ebfb31c8cd4e6dc354)

4. 对话框保持打开期间，Obsidian 轮询 Google 的令牌端点。授权仍在等待时它保持等待，Google 要求放慢轮询间隔时它会退避。
5. 批准后，Google 返回短期访问令牌、刷新令牌和 OpenID ID 令牌。模块从 ID 令牌提取账户 subject，把刷新令牌存入 Obsidian 的密钥存储，并把访问令牌缓存在内存中。
6. 之后的 Drive 请求使用缓存的访问令牌。接近过期时，模块用刷新令牌换取新的访问令牌。HTTP 401 的失败请求会触发一次强制刷新并重试。

使用设备授权是因为 Obsidian 移动端无法可靠地提供常见交互式 OAuth 流程所需的本地浏览器重定向、localhost 监听或桌面式自定义 URL 回调。设备授权把 OAuth 交互保留在普通浏览器中，Obsidian 应用轮询 Google 的端点，因此同一套连接流程在桌面和移动端都能工作。

## 权限与范围

模块只请求这几个 OAuth scope：

### `drive.file`

这个 scope 允许模块创建和管理它在 Google Drive 中创建的文件。同步需要这个访问权限来：

- 创建基目录和仓库文件
- 列出模块自己的文件以发现远端变更
- 读取文件内容和元数据
- 上传新内容并更新已有文件
- 移动或重命名文件
- 删除文件（永久删除或移入垃圾桶）

这个 scope **不**授予对用户 Drive 的一般访问权限。特别是，模块无法发现或同步插件之外创建的文件。授予 `drive.file` 是刻意的最小权限选择：模块可以管理自己的同步数据，而不会获得读取无关 Drive 文件的权限。

### `openid`

`openid` scope 让 Google 在设备授权期间返回 OpenID Connect ID 令牌。模块读取令牌中稳定的 `sub` subject 标识并存储为已连接账户的标识。这让 Sync Engine 能识别连接的是哪个 Google 账户，并区分多个账户连接，使不同 Google 账户的同步记录互不干扰；它不读取用户资料，也不请求宽泛的身份权限。

## 文件元数据

Google Drive 把文件元数据存储为文件资源上的 `appProperties`。文件 `meta` 非空时，`write()` 和 `writeStream()` 会带上 `appProperties`。存在时，`stat()` 和 `list()` 把 `appProperties` 作为文件的 `meta` 返回。

## 隐私政策

最后更新于 **2026 年 8 月 23 日**。

### 引言

本隐私政策说明 Obsidian 的 Sync Engine 插件与 Google Drive 模块（下称"插件"）在你连接 Google Drive 账户时如何处理你的数据。插件是 MIT 协议授权的开源软件。

### 我们收集的数据

**我们不收集任何数据。** 插件没有遥测、没有分析、没有远程日志服务，也没有后端服务器。任何关于你、你的文件或你的使用情况的信息都不会离开你的本地设备。

### 你的数据如何被处理

**Google 账户连接**：

点击 "Connect" 时，插件在你的设备与 Google 服务器之间直接发起 Google 设备授权流程。插件只请求以下 scope：

- `drive.file`：访问由插件创建的文件。插件之外创建的文件对它不可见，即使在配置的基目录内。
- `openid`：提供稳定的 Google 账户 subject 标识，让插件能够识别连接并去重

**令牌存储**：

OAuth 刷新令牌只存储在你本地设备的 Electron 加密密钥存储中。令牌从不传输给任何第三方，从不记录日志，也从不出现在崩溃报告或诊断信息中。

**文件操作**：

所有同步操作都由你手动触发或调度。文件读写直接发生在你的本地 Obsidian 仓库与 Google Drive 之间，经 Google 的 API 完成。没有任何中间服务器参与。

**数据保留**：

你的数据只存在于你的本地设备和你的 Google Drive 账户中。点击 "Disconnect" 时，插件：

1.  向 Google 撤销 OAuth 令牌
2.  从 Electron 密钥存储删除所有已存储的令牌

断开连接后，你的设备上不会残留任何 Google 账户连接的痕迹。

### 第三方

涉及的唯一第三方服务是 Google 的 OAuth 和 Drive API，由你直接授权。除使用其公开 API 外，我们与 Google 没有任何关系。我们不向任何实体共享、出售或转移任何数据。

### 你的权利

你拥有完全的控制：

- 所有数据都在你的本地设备上，随时可以检查
- 点击 "Disconnect" 立即清除所有本地凭据
- 随时在 `https://myaccount.google.com/permissions` 撤销访问
- 无论插件状态如何，你的文件都保留在你的 Google Drive 中

### 变更

本政策的更新将发布在插件的 GitHub 仓库和 `https://sync.consensia.cc`。变更后的继续使用视为接受。

### 联系方式

隐私相关问题请在我们 GitHub 仓库中提交 issue。

## 服务条款

最后更新于 **2026 年 8 月 23 日**。

### 接受条款

安装或使用 Obsidian 的 Sync Engine 插件与 Google Drive 模块（下称"插件"），即表示你同意这些条款。不同意请立即卸载插件。

### 许可

插件以 MIT 协议提供。你可以按该协议条款自由使用、修改和分发它。

### 无担保

**插件按"现状"提供，不附带任何形式的担保，无论是明示还是暗示，包括但不限于对适销性、特定用途适用性和不侵权的担保。作者和版权持有人不对因使用插件产生的任何索赔、损害或其他责任负责，包括数据丢失、同步失败或 Google Drive API 变更。**

### 用户责任

你独自负责：

- 维护 Google 账户凭据的安全
- 了解你选择同步的数据
- 独立于插件备份重要文件
- 连接 Drive 账户时遵守 Google 的服务条款
- 确保本地设备的 Electron 密钥存储保持安全

### 可接受的使用

不得使用插件：

- 违反 Google 的 API 服务条款
- 访问你不拥有或未获授权的账户
- 规避 Google Drive 的存储或速率限制
- 经同步文件分发恶意软件或非法内容

### 第三方服务

插件与 Google 的 OAuth 和 Drive API 交互。这些服务受 Google 自己的服务条款和隐私政策约束。我们无法控制 Google 的服务，对其可用性、变更或终止不承担责任。

### 断开连接与终止

你可以随时点击插件设置中的 "Disconnect" 或卸载插件来终止使用。我们保留随时停止开发或分发插件的权利，恕不另行通知。

### 责任限制

**在法律允许的最大范围内，无论基于何种责任理论，作者或贡献者均不对任何间接、附带、特殊、后果性或惩罚性损害负责，包括利润损失、数据丢失或业务中断。**

### 适用法律

本插件由位于世界各地多个司法管辖区的贡献者以自愿、非商业方式开发和维护。没有单一的适用法律。

这些条款应依据国际法的一般原则和插件分发所依据的 MIT 协议来解释。

### 变更

我们可能随时更新这些条款。变更在 GitHub 仓库中发布后生效。继续使用视为接受。

### 联系方式

条款相关问题请在我们 GitHub 仓库中提交 issue。
