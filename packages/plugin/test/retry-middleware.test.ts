import testKit from '$/test-kit';
import { expect, spyOn, test } from 'bun:test';
import { retryMiddleware } from '@/fs';

const { request } = testKit;
const sleepSpy = spyOn(globalThis, 'sleep').mockImplementation(() => Promise.resolve());

test('retry middleware retries retryable request and waits between attempts', () => {
	sleepSpy.mockClear();
	let attempts = 0;
	const harness = request(() => {
		attempts += 1;
		if (attempts < 3) throw { res: { status: 503 } };
		return {};
	});
	const wrapped = retryMiddleware(harness.request, { maxRetry: 2, retryDelay: () => 25 });

	expect(wrapped({ url: 'retry.md' })).resolves.toMatchObject({ status: 200 });
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

test('retry middleware retries iOS timeout error with localized message and numeric code', () => {
	sleepSpy.mockClear();
	let attempts = 0;
	const harness = request(() => {
		attempts += 1;
		if (attempts < 2)
			throw {
				code: -1001,
				domain: 'NSURLErrorDomain',
				message: 'Die Anfrage hat eine Zeitüberschreitung verursacht.',
			};
		return {};
	});
	const wrapped = retryMiddleware(harness.request, { maxRetry: 2, retryDelay: () => 25 });

	expect(wrapped({ url: 'timeout.md' })).resolves.toMatchObject({ status: 200 });
	expect(harness.calls).toStrictEqual([{ url: 'timeout.md' }, { url: 'timeout.md' }]);
	expect(sleepSpy).toHaveBeenCalledTimes(1);
});

test('retry middleware retries Capacitor-bridged URLSession error with domain string as code', () => {
	sleepSpy.mockClear();
	const harness = request(() => {
		throw { code: 'NSURLErrorDomain', message: '请求超时。' };
	});
	const wrapped = retryMiddleware(harness.request, { maxRetry: 2, retryDelay: () => 25 });

	expect(wrapped({ url: 'capacitor.md' })).rejects.toStrictEqual({
		code: 'NSURLErrorDomain',
		message: '请求超时。',
	});
	expect(harness.calls).toStrictEqual([
		{ url: 'capacitor.md' },
		{ url: 'capacitor.md' },
		{ url: 'capacitor.md' },
	]);
	expect(sleepSpy).toHaveBeenCalledTimes(2);
});

test('retry middleware stops on non-retryable URLSession error code', () => {
	sleepSpy.mockClear();
	const harness = request(() => {
		throw { code: -1200, domain: 'NSURLErrorDomain', message: 'An SSL error has occurred.' };
	});
	const wrapped = retryMiddleware(harness.request, { maxRetry: 3, retryDelay: () => 25 });

	expect(wrapped({ url: 'ssl.md' })).rejects.toStrictEqual({
		code: -1200,
		domain: 'NSURLErrorDomain',
		message: 'An SSL error has occurred.',
	});
	expect(harness.calls).toStrictEqual([{ url: 'ssl.md' }]);
	expect(sleepSpy).not.toHaveBeenCalled();
});

test('retry middleware retries returned retryable status response', () => {
	sleepSpy.mockClear();
	let attempts = 0;
	const harness = request(() => {
		attempts += 1;
		return attempts < 3 ? { status: 503 } : { status: 200 };
	});
	const wrapped = retryMiddleware(harness.request, { maxRetry: 2, retryDelay: () => 25 });

	expect(wrapped({ throw: false, url: 'flaky.md' })).resolves.toMatchObject({ status: 200 });
	expect(harness.calls).toStrictEqual([
		{ throw: false, url: 'flaky.md' },
		{ throw: false, url: 'flaky.md' },
		{ throw: false, url: 'flaky.md' },
	]);
	expect(sleepSpy).toHaveBeenCalledTimes(2);
});

test('retry middleware returns retryable status response after exhausting retries', () => {
	sleepSpy.mockClear();
	const harness = request(() => ({ status: 503 }));
	const wrapped = retryMiddleware(harness.request, { maxRetry: 2, retryDelay: () => 25 });

	expect(wrapped({ throw: false, url: 'down.md' })).resolves.toMatchObject({ status: 503 });
	expect(harness.calls).toHaveLength(3);
	expect(sleepSpy).toHaveBeenCalledTimes(2);
});
