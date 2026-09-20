# Request Middleware

A request middleware is a wrapper around [`Request` and `VaultRequest`](./request). Below is the list of existing middlewares defined in the plugin core.

## Retry Middleware

- Target: `Request`
- Priority: `1000`
- Behavior: auto-retry requests. Receives an options object including `maxRetry` (number) and `isRetryable: () => boolean`.

## Rate Limiter Wrapper

- Target: `Request` and `VaultRequest`
- Priority: `1000` for `VaultRequest`, `2000` for `Request`
- Behavior: limit the max concurrency and request interval of remote requests. Receives `maxConcurrency` and `minInterval` as options in the second argument. Wraps the request with a newly instantiated API limiter composable. For vault rate limiting, `maxConcurrency` is hardcoded to `200` and `minInterval` is `0`.

## Cancellation Middleware

- Target: `Request` and `VaultRequest`
- Priority: `2000` for `VaultRequest`, `4000` for `Request`
- Behavior: wraps request in with a throw if cancelled at before and during requests. Works together with [Cancellation Wrapper](./file-system-wrappers#cancellation-wrapper). Requests carrying `ignoreCancellation: true` pass through untouched, so backends can still send cleanup calls after cancellation.

## Custom Header Middleware

- Target: `Request`
- Priority: `3000`
- Injects extra headers into headers argument.
