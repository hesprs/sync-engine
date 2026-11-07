import testKit from '$/test-kit';
import { rateLimiterMiddleware } from '@/fs';
import { expect, test } from 'bun:test';
import type { RequestResponse } from '@/modules/Registrar';

const { deferred, flush, request } = testKit;

test('rate limiter middleware queues second request until first resolves', async () => {
	const firstDeferred = deferred<Partial<RequestResponse>>();
	const harness = request((url) =>
		url === 'first.md' ? firstDeferred.promise : { status: 202 },
	);
	const wrapped = rateLimiterMiddleware(harness.request, { maxConcurrency: 1, minInterval: 0 });

	const firstPending = wrapped('first.md');
	const secondPending = wrapped('second.md');

	await flush();
	expect(harness.calls).toStrictEqual([{ url: 'first.md' }]);

	firstDeferred.resolve({ status: 201 });

	expect(firstPending).resolves.toMatchObject({ status: 201 });
	expect(secondPending).resolves.toMatchObject({ status: 202 });
	expect(harness.calls).toStrictEqual([{ url: 'first.md' }, { url: 'second.md' }]);
});

test('parallel healthy requests start without added spacing', async () => {
	const starts: Array<number> = [];
	const harness = request(() => {
		starts.push(Date.now());
		return { status: 200 };
	});
	const wrapped = rateLimiterMiddleware(harness.request, { maxConcurrency: 50, minInterval: 0 });

	await Promise.all(Array.from({ length: 5 }, (_, index) => wrapped(`ok${index}`)));

	expect(Math.max(...starts) - Math.min(...starts)).toBeLessThanOrEqual(50);
});

test('429 responses degrade request spacing and successes restore it', async () => {
	const starts: Array<number> = [];
	const harness = request((url) => {
		starts.push(Date.now());
		return url.startsWith('storm') ? { status: 429 } : { status: 200 };
	});
	const wrapped = rateLimiterMiddleware(harness.request, { maxConcurrency: 50, minInterval: 0 });

	await Promise.all(Array.from({ length: 5 }, (_, index) => wrapped(`storm${index}`)));
	await Promise.all(Array.from({ length: 5 }, (_, index) => wrapped(`probe${index}`)));

	const probeStarts = starts.slice(-5);
	const gaps = probeStarts.slice(0, -1).map((start, index) => probeStarts[index + 1] - start);
	// Five 429s pace the probes 160ms apart, then each success shrinks the gap: 160, 120, 90, 67.
	expect(gaps[0]).toBeGreaterThanOrEqual(100);
	expect(gaps[0]).toBeLessThanOrEqual(400);
	expect(gaps).toStrictEqual([...gaps].sort((a, b) => b - a));
	expect(gaps[3]).toBeLessThan(gaps[0] / 2);
});

test('rejected requests do not degrade request spacing', async () => {
	const starts: Array<number> = [];
	const harness = request((url) => {
		starts.push(Date.now());
		if (url.startsWith('boom')) throw new Error('network down');
		return { status: 200 };
	});
	const wrapped = rateLimiterMiddleware(harness.request, { maxConcurrency: 50, minInterval: 0 });

	await Promise.allSettled(Array.from({ length: 3 }, (_, index) => wrapped(`boom${index}`)));
	await Promise.all(Array.from({ length: 5 }, (_, index) => wrapped(`ok${index}`)));

	const okStarts = starts.slice(-5);
	expect(Math.max(...okStarts) - Math.min(...okStarts)).toBeLessThanOrEqual(50);
});
