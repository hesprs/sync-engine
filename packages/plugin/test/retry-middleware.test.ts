import testKit from '$/test-kit';
import { expect, spyOn, test } from 'bun:test';
import { retryMiddleware } from '@/fs';

const { bytes, request } = testKit;
const sleepSpy = spyOn(globalThis, 'sleep').mockImplementation(() => Promise.resolve());

test('retry middleware retries retryable request and waits between attempts', () => {
	sleepSpy.mockClear();
	const response = {
		bytes: () => bytes('ok'),
		headers: {},
		json: () => {},
		status: 200,
		text: () => 'ok',
	};
	let attempts = 0;
	const harness = request(() => {
		attempts += 1;
		// oxlint-disable-next-line typescript/only-throw-error
		if (attempts < 3) throw { res: { status: 503 } };
		return Promise.resolve(response);
	});
	const wrapped = retryMiddleware(harness.request, { maxRetry: 2, retryDelay: () => 25 });

	expect(wrapped({ url: 'retry.md' })).resolves.toStrictEqual(response);
	expect(harness.calls).toStrictEqual([
		{ url: 'retry.md' },
		{ url: 'retry.md' },
		{ url: 'retry.md' },
	]);
	expect(sleepSpy).toHaveBeenCalledTimes(2);
	expect(sleepSpy).toHaveBeenNthCalledWith(1, 25);
	expect(sleepSpy).toHaveBeenNthCalledWith(2, 25);
});

test('retry middleware stops on non-retryable error', () => {
	sleepSpy.mockClear();
	const harness = request(() => {
		// oxlint-disable-next-line typescript/only-throw-error
		throw { res: { status: 404 } };
	});
	const wrapped = retryMiddleware(harness.request, {
		isRetryable: () => false,
		maxRetry: 3,
		retryDelay: () => 25,
	});

	expect(wrapped({ url: 'missing.md' })).rejects.toStrictEqual({ res: { status: 404 } });
	expect(harness.calls).toStrictEqual([{ url: 'missing.md' }]);
	expect(sleepSpy).not.toHaveBeenCalled();
});
