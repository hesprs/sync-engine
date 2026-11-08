import testKit from '$/test-kit';
import { optimizationWrapper } from '@/fs';
import { expect, test } from 'bun:test';
import type { OptimizerInput, OptimizerOutput } from '@/fs';
import type { Binary, FileStat } from '@/types';

type BatchOptimizer = (input: OptimizerInput) => OptimizerOutput;
const { bytes, deferred, file, flush, folder, fs, stream } = testKit;

async function flushOptimization() {
	await flush();
	await new Promise<void>((resolve) => {
		window.setTimeout(resolve, 0);
	});
	await flush();
}

function createBatchRecorder() {
	const seen: Array<Array<string>> = [];
	const batchOptimizer: BatchOptimizer = ({ atoms }) => {
		seen.push(atoms.map(({ type }) => type));
		return atoms;
	};

	return { batchOptimizer, seen };
}

test('optimization wrapper forwards queued operations to batch optimizer in admission order', async () => {
	const remote = fs();
	const { batchOptimizer, seen } = createBatchRecorder();
	const wrapper = optimizationWrapper(remote.fs, batchOptimizer);
	const noteStat = file('note.md');

	const pending = Promise.all([
		wrapper.delete('folder/'),
		wrapper.mkdir('notes/', folder('notes/')),
		wrapper.write('note.md', bytes('body'), noteStat),
		wrapper.move('old.md', 'new.md'),
	]);

	await flushOptimization();

	expect(seen).toStrictEqual([['delete', 'mkdir', 'write', 'move']]);
	expect(remote.calls.delete).toStrictEqual(['folder/']);
	expect(remote.calls.mkdir).toStrictEqual([['notes/', folder('notes/'), undefined]]);
	expect(remote.calls.write).toStrictEqual([['note.md', bytes('body'), noteStat]]);
	expect(remote.calls.move).toStrictEqual([['old.md', 'new.md']]);
	await pending;
});

test('optimization wrapper bypasses batch optimizer for a single operation', async () => {
	const remote = fs();
	const batchOptimizer: BatchOptimizer = () => {
		throw new Error('batch optimizer should not run');
	};
	const wrapper = optimizationWrapper(remote.fs, batchOptimizer);
	const recursiveValues: Array<boolean | undefined> = [];

	remote.control.mkdir = (_key, _stat, recursive) => {
		recursiveValues.push(recursive);
	};

	await wrapper.mkdir('folder/nested/', folder('folder/nested/'), true);

	expect(remote.calls.mkdir).toStrictEqual([['folder/nested/', folder('folder/nested/'), true]]);
	expect(recursiveValues).toStrictEqual([true]);
});

test('optimization wrapper propagates queued operation rejection', async () => {
	const remoteError = new Error('delete failed');
	const remote = fs({ control: { delete: () => Promise.reject(remoteError) } });
	const wrapper = optimizationWrapper(remote.fs, ({ atoms }) => atoms);

	let rejection: unknown;
	try {
		await wrapper.delete('folder/');
	} catch (error) {
		rejection = error;
	}
	expect(rejection).toBe(remoteError);
});

test('optimization wrapper propagates write rejection', async () => {
	const writeError = new Error('write failed');
	const local = fs({ control: { write: () => Promise.reject(writeError) } });
	const wrapper = optimizationWrapper(local.fs, ({ atoms }) => atoms);

	let rejection: unknown;
	try {
		await wrapper.write('note.md', bytes('body'), file('note.md'));
	} catch (error) {
		rejection = error;
	}
	expect(rejection).toBe(writeError);
});

test('optimization wrapper executes writeStream only after its value resolves', async () => {
	const remote = fs();
	const wrapper = optimizationWrapper(remote.fs, ({ atoms }) => atoms);
	const value = deferred<ReadableStream<Binary>>();
	const streamStat: FileStat = file('stream.md');

	const pendingWriteStream = wrapper.writeStream('stream.md', value.promise, streamStat);
	await flushOptimization();

	// The write atom runs at flush time, but the underlying write must not start before the data arrives.
	expect(remote.calls.writeStream).toStrictEqual([]);

	value.resolve(stream(['body']));
	await flush();
	await pendingWriteStream;

	expect(remote.calls.writeStream).toStrictEqual([['stream.md', streamStat]]);
});

test('optimization wrapper propagates value rejection to the write caller', async () => {
	const remote = fs();
	const wrapper = optimizationWrapper(remote.fs, ({ atoms }) => atoms);
	const value = deferred<Binary>();
	const regret = new Error('Write regretted.');

	const pendingWrite = wrapper.write('note.md', value.promise, file('note.md'));
	value.reject(regret);

	let rejection: unknown;
	try {
		await pendingWrite;
	} catch (error) {
		rejection = error;
	}
	expect(rejection).toBe(regret);
	expect(remote.calls.write).toStrictEqual([]);
});
