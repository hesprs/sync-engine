# Request Middleware

A request middleware is a wrapper around [`Request` and `VaultRequest`](./request). Below is the list of existing middlewares defined in the plugin core.

## Retry Middleware

- Target: `Request`
- Priority: `2000`
- Behavior: auto-retry requests. Receives an options object including `maxRetry` (number) and `isRetryable: () => boolean`. When a retryable response carries a `Retry-After` header, the wait follows it instead of the default delay; a `Retry-After` above 180 seconds returns the response as-is instead of waiting.

## Rate Limiter Wrapper

- Target: `Request`
- Priority: `1000`
- Behavior: limit the max concurrency and request interval of remote requests. Receives `maxConcurrency` and `minInterval` as options in the second argument. The limiter is adaptive: 429 responses grow a pacing penalty that spaces request starts further apart (starting at 10 ms, capped at 2000 ms), and every other response shrinks it.

## Cancellation Middleware

- Target: `Request` and `VaultRequest`
- Priority: `1000` for `VaultRequest`, `4000` for `Request`
- Behavior: wraps request in with a throw if cancelled at before and during requests. Works together with [Cancellation Wrapper](./file-system-wrappers#cancellation-wrapper). Requests carrying `ignoreCancellation: true` pass through untouched, so backends can still send cleanup calls after cancellation.

## Custom Header Middleware

- Target: `Request`
- Priority: `3000`
- Injects extra headers into headers argument.
