# 请求中间件

请求中间件是围绕 [`Request` 和 `VaultRequest`](./request) 的包装器。下面是插件核心中已有中间件的列表。

## 重试中间件

- 目标：`Request`
- 优先级：`2000`
- 行为：自动重试请求。接收一个选项对象，包括 `maxRetry`（数字）和 `isRetryable: () => boolean`。可重试的响应带有 `Retry-After` 头时，等待时间遵循它而不是默认延迟；超过 180 秒的 `Retry-After` 会原样返回响应而不等待。

## 速率限制包装器

- 目标：`Request`
- 优先级：`1000`
- 行为：限制远端请求的最大并发数和请求间隔。第二个参数以选项形式接收 `maxConcurrency` 和 `minInterval`。限制器是自适应的：429 响应会增大一个节流惩罚，让请求开始时间的间隔拉大（起点 10 ms，上限 2000 ms），其他每个响应都会缩小它。

## 取消中间件

- 目标：`Request` 和 `VaultRequest`
- 优先级：`VaultRequest` 为 `1000`，`Request` 为 `4000`
- 行为：请求转发前和进行中检查取消状态，取消时以抛出异常包装请求。与[取消包装器](./file-system-wrappers#cancellation-wrapper)配合工作。携带 `ignoreCancellation: true` 的请求原样通过，后端在取消之后仍能发送清理调用。

## 自定义请求头中间件

- 目标：`Request`
- 优先级：`3000`
- 向 headers 参数注入额外的请求头。
