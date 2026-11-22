# WebDAV 模块

WebDAV 模块注册 `webdav` 远端文件系统。它只使用 Sync Engine 注入的 [`Request`](../request) 抽象实现[统一文件系统键模式](../file-system#统一键模式)，不依赖任何 WebDAV 客户端库。

## 支持的后端

标准模式理论上可以配合任何支持 HTTP(S)、Basic 或 Digest (MD5) 认证、range `GET`、`PROPFIND`、`PUT`、`DELETE`、`MOVE` 和 `MKCOL` 的 WebDAV 服务工作。这包括基于以下项目的 WebDAV 安装：

- Nextcloud
- ownCloud
- Apache `mod_dav`
- Microsoft IIS WebDAV
- InfiniCLOUD
- Koofr WebDAV API
- Synology WebDAV Server
- Seafile 的 WebDAV 扩展
- SabreDAV
- Nutstore
- AList、OpenList 和 Cloudreve 的 WebDAV 兼容层

可选的分片上传模式要求 Nextcloud 的上传协议，不是标准 WebDAV。只在兼容的 Nextcloud 服务器上启用它。

## 认证

模块先发送 Basic 凭据。服务器以 `401` 和 Digest 挑战应答时，它切换到 Digest（带 `qop=auth` 的 MD5，或不带 `qop` 的旧式方案），并把挑战状态缓存在内存数据库中，以端点、用户名和密码为键。指名其他算法的挑战会被拒绝，模块继续发送 Basic 凭据。

## 设置

模块注册这些设置：

- **Server URL**：HTTP 或 HTTPS WebDAV 端点。无效 URL 和非 HTTP(S) 协议被拒绝；保存时移除尾部斜杠。
- **Username**：WebDAV 账户名，保存前去除首尾空格。
- **Password**：WebDAV 账户密码。Obsidian 把它保存在钥匙串中，而不是模块设置里。
- **Base directory**：成为仓库根目录的远端目录。`/` 使用端点根目录。值会被去除首尾空格并以尾部斜杠规范化。持久化的空值在模块构造时默认为 `<仓库名>/`。
- **Use `Depth: infinity`**：用一个 `PROPFIND` 请求列出整棵目录树，而不是递归遍历单层深度响应。它可以加快远端发现，但一些服务器不支持它。启用[非对称存储](../asymmetric-storage)时它没有性能收益。
- **Nextcloud-style chunked upload**：通过 Nextcloud 的分片上传协议上传大的流式文件，而不是把整个文件缓冲在内存中。大多数 WebDAV 服务器不支持这种模式。
- **File metadata**：上传后通过 `PROPPATCH` 把文件元数据（例如创建时间）存为 JSON 编码的自定义属性 `se:meta`，并在 `PROPFIND` 时读回。只在服务器支持带自定义 dead property 的 `PROPPATCH` 时启用。

## 文件操作

`read()` 发送 `GET` 并返回响应字节。`write()` 发送 `PUT`，响应带有 `ETag` 头时返回它；否则立即调用 `stat()` 并返回得到的文件 UID。文件元数据启用且文件的 `meta` 非空时，`write()` 还会发送 `PROPPATCH` 请求，把元数据存为 JSON 编码的 `se:meta` 自定义属性。`PUT` 和 `PROPPATCH` 并发执行。

`delete()` 发送 `DELETE`，把 HTTP `404` 视为已删除。`move()` 发送带 `Destination` 头的 `MOVE`。`mkdir()` 发送 `MKCOL`；递归创建按顺序创建祖先目录并忽略 HTTP `405`（表示目录已存在）。

`stat()` 对目标发送 depth 为零的 `PROPFIND`。请求索取资源类型、修改时间、内容长度和 `ETag`；文件元数据启用时还索取 `se:meta`。文件 UID 优先用 `ETag`，否则用 `<mtime>~<size>`；文件夹没有 UID。`exists()` 使用相同的查询，HTTP `404` 返回 `false`。

`PROPFIND` 响应分页通过 `Link: <...>; rel="next"` 响应头支持。

## 流式传输

`readStream()` 使用 range `GET` 请求，因为 [`Request` 无法暴露响应流](../request#限制)。它请求 2 MiB 的 range，同时在途请求最多八个，缓冲的分块最多八个，并按源顺序发出分块。只有流的消费者还能接收数据时才调度新请求。零字节文件返回一个关闭的流。

未启用分片上传时，`writeStream()` 在内存中收集完整的输入流，然后携带文件的 stat（含元数据）调用 `write()`。

启用 Nextcloud 风格分片上传时，它：

1. 在 Nextcloud 的上传端点下创建以 UUID 命名的上传集合。
2. 把输入切成 5 MiB 的编号分块，最多三个并发上传。每个上传带 `Destination` 和 `OC-Total-Length` 头。
3. 把生成的 `.file` 移动到目标位置。
4. 返回 `ETag` 或 `OC-ETag`；两者都不存在时，调用 `stat()` 获取文件 UID。文件元数据启用时，`MOVE` 之后发送 `PROPPATCH` 存储 `se:meta`。

失败时，模块等待进行中的上传完成并删除临时上传集合。

## 基目录包装器

WebDAV 使用共享的可导入 [`prefixWrapper`](../../development/file-system#prefixwrapper) 把配置的基目录暴露为文件系统根。包装器链细节见[文件系统包装器](../file-system-wrappers)。
