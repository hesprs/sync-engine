import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import type { RequestResponse } from '@/modules/Registrar';
import { rateLimiterMiddleware } from '@/fs';

const { deferred, flush, request } = testKit;

test('rate limiter middleware queues second request until first resolves', async () => {
	const firstDeferred = deferred<Partial<RequestResponse>>();
	const harness = request((params) => {
		const url = typeof params === 'string' ? params : params.url;
		if (url === 'first.md') return firstDeferred.promise;
		return { status: 202 };
	});
	const wrapped = rateLimiterMiddleware(harness.request, { maxConcurrency: 1, minInterval: 0 });

	const firstPending = wrapped({ url: 'first.md' });
	const secondPending = wrapped({ url: 'second.md' });

	await flush();
	expect(harness.calls).toStrictEqual([{ url: 'first.md' }]);

	firstDeferred.resolve({ status: 201 });

	expect(firstPending).resolves.toMatchObject({ status: 201 });
	expect(secondPending).resolves.toMatchObject({ status: 202 });
	expect(harness.calls).toStrictEqual([{ url: 'first.md' }, { url: 'second.md' }]);
});
