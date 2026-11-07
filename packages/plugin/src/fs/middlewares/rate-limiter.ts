import type { Request } from '@/modules/Registrar';
import type { MaybePromise } from '@/types';

type RateLimiterOptions = { maxConcurrency: number; minInterval: number };

const FIRST_PENALTY_MS = 10;
const MAX_PENALTY_MS = 2000;

export default function rateLimiterMiddleware(
	request: Request,
	options: RateLimiterOptions,
): Request {
	const limiter = new ApiLimiter(options);
	const paced = limiter.wrap(request);
	return async (url, params) => {
		const response = await paced(url, params);
		limiter.observe(response.status);
		return response;
	};
}

/**
 * A request queue with bounded concurrency. 429 responses grow a pacing penalty that spaces request
 * starts further apart, and every other response shrinks it.
 */
class ApiLimiter {
	private activeCount = 0;
	private lastStartTime = 0;
	private penaltyMs = 0;
	private readonly queue: Array<() => void> = [];
	private timer: number | undefined;
	maxConcurrency: number;
	minInterval: number;

	constructor({ maxConcurrency = Infinity, minInterval = 0 } = {}) {
		this.maxConcurrency = maxConcurrency;
		this.minInterval = minInterval;
	}

	observe(status: number): void {
		this.penaltyMs =
			status === 429
				? Math.min(Math.max(this.penaltyMs * 2, FIRST_PENALTY_MS), MAX_PENALTY_MS)
				: Math.floor((this.penaltyMs * 3) / 4);
	}

	schedule<T>(fn: () => T | Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push(() => {
				Promise.resolve()
					.then(fn)
					.then(resolve)
					.catch(reject)
					.finally(() => {
						this.activeCount--;
						this.processQueue();
					});
			});
			this.processQueue();
		});
	}

	wrap<TArgs extends Array<unknown>, TResult>(
		fn: (...args: TArgs) => MaybePromise<TResult>,
	): (...args: TArgs) => Promise<TResult> {
		return (...args: TArgs) => this.schedule(() => fn(...args));
	}

	private processQueue() {
		if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) return;

		const now = Date.now();
		const nextAllowed = this.lastStartTime + this.minInterval + this.penaltyMs;
		if (now < nextAllowed) {
			if (this.timer) return;
			this.timer = window.setTimeout(() => {
				this.timer = undefined;
				this.processQueue();
			}, nextAllowed - now);
			return;
		}

		const task = this.queue.shift();
		if (!task) return;
		this.activeCount++;
		this.lastStartTime = now;
		task();
		this.processQueue();
	}
}
