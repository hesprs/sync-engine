import testKit from '$/test-kit';
import { cancellationWrapper } from '@/fs';
import { syncCancelledError } from '@/sync';
import { expect, test } from 'bun:test';
import { ref } from 'synthkernel';

const { bytes, deferred, file, flush, fs, stream } = testKit;

test('cancellation wrapper rejects read before delegation', () => {
	const harness = fs();
	const wrapper = cancellationWrapper(harness.fs, ref(true));

	expect(wrapper.read('note.md', file('note.md'))).rejects.toBe(syncCancelledError);
	expect(harness.calls.read).toStrictEqual([]);
});

test('cancellation wrapper rejects write after resolution when cancelled', async () => {
	const isCancelled = ref(false);
	const writeDeferred = deferred<string>();
	const harness = fs({ control: { write: () => writeDeferred.promise } });
	const wrapper = cancellationWrapper(harness.fs, isCancelled);
	const noteStat = file('note.md');

	const pending = wrapper.write('note.md', bytes('1234'), noteStat);
	await flush();
	isCancelled(true);
	writeDeferred.resolve('write-uid');

	expect(pending).rejects.toBe(syncCancelledError);
	expect(harness.calls.write).toStrictEqual([['note.md', bytes('1234'), noteStat]]);
});

test('cancellation wrapper rejects writeStream after resolution when cancelled', async () => {
	const isCancelled = ref(false);
	const writeDeferred = deferred<string>();
	const harness = fs({ control: { writeStream: () => writeDeferred.promise } });
	const wrapper = cancellationWrapper(harness.fs, isCancelled);
	const streamStat = file('stream.md');

	const pending = wrapper.writeStream('stream.md', stream(['1234']), streamStat);
	await flush();
	isCancelled(true);
	writeDeferred.resolve('stream-uid');

	expect(pending).rejects.toBe(syncCancelledError);
	expect(harness.calls.writeStream).toStrictEqual([['stream.md', streamStat]]);
});
