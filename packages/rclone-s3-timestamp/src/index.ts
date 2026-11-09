import parseTimestamp from '@repo/shared/timestamp';
import type {
	RemoteRequestMiddlewareEntry,
	RequestParam,
	SelectFromContext,
	StringKV,
} from '@hesprs/sync-engine-sdk';

/**
 * Adapts S3 requests for `rclone serve s3`, which reads `x-amz-meta-mtime` as Unix seconds while
 * Sync Engine stores milliseconds.
 *
 * - Outbound headers convert milliseconds to seconds when they hold a Sync Engine timestamp;
 *   encrypted or foreign values pass through unchanged, as does `ctime`, which rclone never
 *   parses.
 * - Inbound headers convert seconds back to milliseconds. After a serve restart the header is absent;
 *   the S3 backend then recovers the time from `Last-Modified` on its own.
 *
 * Priority 307 sits outside the S3 SigV4 middleware (304) so signatures cover the converted value,
 * and inside the retry middleware (2000) so every attempt converts from the original parameters.
 */
const MTIME = 'x-amz-meta-mtime';

export default class rcloneS3Timestamp {
	private readonly cleanup: Array<() => void> = [];

	constructor(
		private readonly ctx: SelectFromContext<{
			settings: { remoteFs: string };
			registerRemoteRequestMiddleware: (entry: RemoteRequestMiddlewareEntry) => () => void;
		}>,
	) {}

	readonly start = () =>
		(this.dispose = this.ctx.registerRemoteRequestMiddleware({
			apply: (request) => {
				if (this.ctx.settings.remoteFs === 's3')
					return (url, params = {}) =>
						request(url, rewriteOutbound(params)).then((response) => ({
							...response,
							headers: rewriteInbound(response.headers),
						}));
			},
			priority: 307,
		}));

	dispose?: () => void;
}

function rewriteOutbound(params: RequestParam): RequestParam {
	const ms = parseTimestamp(params.headers?.[MTIME]);
	if (!ms) return params;
	return { ...params, headers: { ...params.headers, [MTIME]: String(ms / 1000) } };
}

function rewriteInbound(headers: StringKV): StringKV {
	for (const [name, value] of Object.entries(headers)) {
		if (name.toLowerCase() !== MTIME) continue;
		const seconds = Number(value);
		if (!seconds || !Number.isFinite(seconds)) return headers;
		// Math.round absorbs float-multiply artifacts (e.g. 1700000123.456 * 1000).
		headers[name] = String(Math.round(seconds * 1000));
		break;
	}
	return headers;
}
