import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import { ref } from 'synthkernel';
import type { RequestResponse } from '@/modules/Registrar';
import { cancellationMiddleware } from '@/fs';

const { deferred, flush, request } = testKit;

test('cancellation middleware rejects before dispatch', () => {
	const harness = request(() => ({}));
	const wrapped = cancellationMiddleware(harness.request, ref(true));

	expect(() => wrapped({ url: 'note.md' })).toThrow('Sync cancelled by user.');
	expect(harness.calls).toStrictEqual([]);
});

test('cancellation middleware rejects after in-flight response resolves when cancelled', async () => {
	const isCancelled = ref(false);
	const responseDeferred = deferred<Partial<RequestResponse>>();
	const harness = request(() => responseDeferred.promise);
	const wrapped = cancellationMiddleware(harness.request, isCancelled);

	const pending = wrapped({ url: 'note.md' });
	await flush();
	isCancelled(true);
	responseDeferred.resolve({});

	expect(pending).rejects.toMatchObject({
		message: 'Aborted',
		name: 'AbortError',
	});
	expect(harness.calls).toStrictEqual([{ url: 'note.md' }]);
});
