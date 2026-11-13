import { getStatus } from '@repo/shared/error';
import type { Request } from '@/modules/Registrar';
import type { ErrorLike } from '@repo/shared/error';

const MAX_RETRY_AFTER = 180;

type RetryOptions = {
	maxRetry?: number;
	isRetryable?: (error: unknown) => boolean;
	retryDelay?: (count: number) => number;
};

const backoff = (count: number, baseMs = 1000, maxMs = 30_000): number => {
	const exp = Math.min(baseMs * 2 ** count, maxMs);
	return Math.random() * exp;
};

export default function retryMiddleware(request: Request, options?: RetryOptions): Request {
	const { maxRetry = 4, isRetryable = isRetryableError, retryDelay = backoff } = options ?? {};
	return async (url, params) => {
		for (let i = 0; ; i++)
			try {
				const response = await request(url, params);
				if (RETRYABLE_STATUS_CODES.has(response.status) && i < maxRetry) {
					const retryAfter = Number(response.headers['retry-after']);
					if (retryAfter && retryAfter > MAX_RETRY_AFTER) return response;
					await sleep(retryAfter || retryDelay(i));
					continue;
				}
				return response;
			} catch (error) {
				if (!isRetryable(error) || i >= maxRetry) throw error;
				await sleep(retryDelay(i));
			}
	};
}

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_URL_ERROR_CODES = new Set([-1001, -1003, -1004, -1005, -1006, -1009]); // Apple product native URLSession errors
const URL_ERROR_DOMAINS = new Set(['NSURLErrorDomain', 'kCFErrorDomainCFNetwork']);

function isRetryableUrlError({ code, domain }: ErrorLike): boolean {
	// Capacitor bridges the domain string as `code`.
	if (typeof code === 'string') return URL_ERROR_DOMAINS.has(code);
	if (typeof code !== 'number' || !RETRYABLE_URL_ERROR_CODES.has(code)) return false;
	return domain === undefined || (typeof domain === 'string' && URL_ERROR_DOMAINS.has(domain));
}

const RETRYABLE_MESSAGE_PATTERNS = [
	/\bnet::ERR_CONNECTION_CLOSED\b/iu,
	/\bnet::ERR_CONNECTION_RESET\b/iu,
	/\bnet::ERR_CONNECTION_ABORTED\b/iu,
	/\bnet::ERR_CONNECTION_TIMED_OUT\b/iu,
	/\bnet::ERR_NETWORK_CHANGED\b/iu,
	/\bnet::ERR_INTERNET_DISCONNECTED\b/iu,
	/\bnet::ERR_HTTP2_PING_FAILED\b/iu,
	/\bnet::ERR_HTTP2_SERVER_REFUSED_STREAM\b/iu,
	/\bnet::ERR_HTTP2_RST_STREAM_NO_ERROR_RECEIVED\b/iu,
	/\bnet::ERR_HTTP2_STREAM_CLOSED\b/iu,
	/\bnet::ERR_INCOMPLETE_HTTP2_HEADERS\b/iu,
	/\bnet::ERR_HTTP2_PROTOCOL_ERROR\b/iu,
	/\bnet::ERR_HTTP2_FLOW_CONTROL_ERROR\b/iu,
	/\bnet::ERR_HTTP2_FRAME_SIZE_ERROR\b/iu,
	/\bnet::ERR_HTTP2_COMPRESSION_ERROR\b/iu,
	/\bECONNRESET\b/iu,
	/\bECONNABORTED\b/iu,
	/\bECONNREFUSED\b/iu,
	/\bETIMEDOUT\b/iu,
	/\bEAI_AGAIN\b/iu,
	/\bsocket hang up\b/iu,
	/\bconnection closed\b/iu,
	/\bconnection reset\b/iu,
	/\bconnection abort(?:ed)?\b/iu,
	/\bconnection refused\b/iu,
	/\bstream closed\b/iu,
	/\bstream was reset\b/iu,
	/\bunexpected end of stream\b/iu,
	/\bbroken pipe\b/iu,
	/\bsocket closed\b/iu,
	/\bnetwork is unreachable\b/iu,
	/\bfailed to connect\b/iu,
	/\btemporarily unavailable\b/iu,
	/\btime-?out\b/iu,
	/\btimed out\b/iu,
];

function hasRetryableMessage(message: string): boolean {
	return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function isRetryableError(err: unknown): boolean {
	const queue: Array<unknown> = [err];
	const visited = new Set<object>();
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) continue;
		if (typeof current === 'string') {
			if (hasRetryableMessage(current)) return true;
			continue;
		}
		if (typeof current !== 'object') continue;
		if (visited.has(current)) continue;
		visited.add(current);
		const statusCode = getStatus(current);
		const { message, cause, error } = current as ErrorLike;
		if (isRetryableUrlError(current)) return true;
		if (statusCode && RETRYABLE_STATUS_CODES.has(statusCode)) return true;
		if (typeof message === 'string' && hasRetryableMessage(message)) return true;
		if (cause) queue.push(cause);
		if (error) queue.push(error);
	}
	return false;
}
