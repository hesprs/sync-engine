import type { ErrorLike } from '@repo/shared/get-status';
import { getStatus } from '@repo/shared/get-status';
import type { Request } from '@/modules/Registrar';

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
	return async (args) => {
		for (let i = 0; ; i++)
			try {
				return await request(args);
			} catch (error) {
				if (!isRetryable(error) || i >= maxRetry) throw error;
				await sleep(retryDelay(i));
			}
	};
}

const RETRYABLE_STATUS_CODES = new Set([401, 408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_URL_ERROR_CODES = new Set([-1001, -1003, -1004, -1005, -1006, -1009]); // IOS/macOS native URLSession errors
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
	/\bECONNRESET\b/iu,
	/\bECONNABORTED\b/iu,
	/\bECONNREFUSED\b/iu,
	/\bETIMEDOUT\b/iu,
	/\bEAI_AGAIN\b/iu,
	/\bsocket hang up\b/iu,
	/\bconnection closed\b/iu,
	/\bconnection reset\b/iu,
	/\bconnection aborted\b/iu,
	/\bconnection refused\b/iu,
	/\btemporarily unavailable\b/iu,
	/\btimed out\b/iu,
];

function hasRetryableMessage(message: string): boolean {
	return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function isRetryableError(error: unknown): boolean {
	const queue: Array<unknown> = [error];
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
		const errorLike = current as ErrorLike;
		if (isRetryableUrlError(current)) return true;
		const statusCode = getStatus(errorLike);
		if (statusCode && RETRYABLE_STATUS_CODES.has(statusCode)) return true;
		if (typeof errorLike.message === 'string' && hasRetryableMessage(errorLike.message))
			return true;
		if (errorLike.cause) queue.push(errorLike.cause);
		if (errorLike.error) queue.push(errorLike.error);
	}
	return false;
}
