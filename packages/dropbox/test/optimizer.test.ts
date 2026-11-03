import { API_RPC } from '@/dropbox/api';
import DropboxFs from '@/dropbox/fs';
import dropboxOptimizer from '@/optimizer';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import type {
	InputAtom,
	MaybePromise,
	RequestParam,
	RequestResponse,
	OutputAtom,
} from '@hesprs/sync-engine-sdk';

const { deferred, flush, request } = testKit;

type Control = (url: string, params: RequestParam) => MaybePromise<Partial<RequestResponse>>;

type AtomSpy = { executed: boolean; rejected?: string; resolved: boolean };

function spy(): AtomSpy {
	return { executed: false, resolved: false };
}

function json(value: unknown, status = 200): Partial<RequestResponse> {
	return {
		// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
		json: <T extends object = object>() => value as T,
		status,
		text: () => JSON.stringify(value),
	};
}

function bodyOf(params: RequestParam): Record<string, unknown> {
	const body = params.body;
	if (typeof body === 'string') return JSON.parse(body) as Record<string, unknown>;
	return JSON.parse(
		new TextDecoder().decode(body instanceof Uint8Array ? body : new Uint8Array(0)),
	) as Record<string, unknown>;
}

function batchEntries(paths: Array<string>, failures: Record<string, string> = {}) {
	return {
		'.tag': 'complete',
		entries: paths.map((path) =>
			failures[path]
				? { '.tag': 'failure', failure: { '.tag': failures[path] } }
				: { '.tag': 'success' },
		),
	};
}

function mkdirAtom(key: string, status: AtomSpy, throwOnExecute = false): InputAtom {
	return {
		execute: () => {
			status.executed = true;
			if (throwOnExecute) throw new Error('should not run individually');
		},
		key,
		reject: (error) => (status.rejected = error.message),
		resolve: () => (status.resolved = true),
		type: 'mkdir',
	};
}

function deleteAtom(key: string, status: AtomSpy, throwOnExecute = false): InputAtom {
	return {
		execute: () => {
			status.executed = true;
			if (throwOnExecute) throw new Error('should not run individually');
		},
		key,
		reject: (error) => (status.rejected = error.message),
		resolve: () => (status.resolved = true),
		type: 'delete',
	};
}

function moveAtom(
	oldKey: string,
	newKey: string,
	status: AtomSpy,
	throwOnExecute = false,
): InputAtom {
	return {
		execute: () => {
			status.executed = true;
			if (throwOnExecute) throw new Error('should not run individually');
		},
		newKey,
		oldKey,
		reject: (error) => (status.rejected = error.message),
		resolve: () => (status.resolved = true),
		type: 'move',
	};
}

function writeAtom(key: string, status: AtomSpy): InputAtom {
	return {
		execute: () => {
			status.executed = true;
			return 'write-uid';
		},
		key,
		reject: (error) => (status.rejected = error.message),
		resolve: () => (status.resolved = true),
		type: 'write',
	};
}

function createHarness(control: Control) {
	const harness = request(control);
	const fs = new DropboxFs(harness.request, { accountId: 'dbid:1', useTrash: true });
	const run = (atoms: Array<InputAtom>) => {
		const started = new WeakMap<OutputAtom, Promise<string | void>>();
		const executeAtom = (atom: OutputAtom) => {
			const pending = started.get(atom);
			if (pending) return pending;
			const result = Promise.resolve(atom.execute());
			started.set(atom, result);
			return result;
		};
		const optimized = dropboxOptimizer({ atoms, executeAtom, fs }) ?? atoms;
		return { executeAtom, optimized };
	};
	return { calls: harness.calls, run };
}

const URLS = {
	createFolderBatch: `${API_RPC}/2/files/create_folder_batch`,
	deleteBatch: `${API_RPC}/2/files/delete_batch`,
	deleteV2: `${API_RPC}/2/files/delete_v2`,
	moveBatch: `${API_RPC}/2/files/move_batch_v2`,
};

test('returns undefined for other file systems', () => {
	expect(
		dropboxOptimizer({ atoms: [], executeAtom: async () => {}, fs: {} as never }),
	).toBeUndefined();
});

test('single operations of each type stay individual', async () => {
	const statuses = [spy(), spy(), spy(), spy()];
	const { run } = createHarness(() => {
		throw new Error('No batch request expected');
	});
	const { executeAtom, optimized } = run([
		mkdirAtom('a/', statuses[0]),
		deleteAtom('b.md', statuses[1]),
		moveAtom('c.md', 'd.md', statuses[2]),
		writeAtom('e.md', statuses[3]),
	]);

	await Promise.all(optimized.map(executeAtom));

	expect(optimized.length).toBe(4);
	expect(statuses.every(({ executed, rejected }) => executed && rejected === undefined)).toBe(
		true,
	);
});

test('mkdir atoms collapse into one batch that gates dependent writes', async () => {
	const release = deferred<Partial<RequestResponse>>();
	const { calls, run } = createHarness((url, params) => {
		expect(url).toBe(URLS.createFolderBatch);
		expect((bodyOf(params) as { paths: Array<string> }).paths).toStrictEqual(['/a', '/a/b']);
		return release.promise;
	});
	const mkdirSpies = [spy(), spy()];
	const writeStatus = spy();
	const { executeAtom, optimized } = run([
		mkdirAtom('a/', mkdirSpies[0], true),
		mkdirAtom('a/b/', mkdirSpies[1], true),
		writeAtom('a/b/x.md', writeStatus),
	]);
	const pending = Promise.all(optimized.map(executeAtom));

	await flush();
	expect(mkdirSpies.every(({ executed }) => !executed)).toBe(true);
	expect(writeStatus.executed).toBe(false);
	expect(calls.length).toBe(1);

	release.resolve(json(batchEntries(['/a', '/a/b'])));
	await pending;
	expect(writeStatus.executed).toBe(true);
	expect(optimized.filter((atom) => atom.type === 'custom').length).toBe(1);
});

test('delete umbrellas subsume descendants before batching', async () => {
	const { calls, run } = createHarness((url, params) => {
		expect(url).toBe(URLS.deleteBatch);
		const { entries } = bodyOf(params) as { entries: Array<{ path: string }> };
		return json(batchEntries(entries.map(({ path }) => path)));
	});
	const umbrella = spy();
	const subsumed = spy();
	const independent = spy();
	const { executeAtom, optimized } = run([
		deleteAtom('a/', umbrella),
		deleteAtom('a/x.md', subsumed, true),
		deleteAtom('b.md', independent),
	]);

	await Promise.all(optimized.map(executeAtom));

	expect(umbrella.resolved).toBe(true);
	expect(subsumed.resolved).toBe(true);
	expect(subsumed.executed).toBe(false);
	expect(independent.resolved).toBe(true);
	expect(
		(bodyOf(calls[0] as RequestParam) as { entries: Array<{ path: string }> }).entries,
	).toStrictEqual([{ path: '/a' }, { path: '/b.md' }]);
});

test('move umbrellas subsume descendant moves before batching', async () => {
	const { calls, run } = createHarness((url, params) => {
		expect(url).toBe(URLS.moveBatch);
		const { entries } = bodyOf(params) as {
			entries: Array<{ from_path: string; to_path: string }>;
		};
		return json(batchEntries(entries.map(({ from_path }) => from_path)));
	});
	const umbrella = spy();
	const subsumed = spy();
	const independent = spy();
	const { executeAtom, optimized } = run([
		moveAtom('old/', 'new/', umbrella),
		moveAtom('old/x.md', 'new/x.md', subsumed, true),
		moveAtom('p.md', 'q.md', independent),
	]);

	await Promise.all(optimized.map(executeAtom));

	expect(umbrella.resolved).toBe(true);
	expect(subsumed.resolved).toBe(true);
	expect(subsumed.executed).toBe(false);
	expect(independent.resolved).toBe(true);
	expect(
		(
			bodyOf(calls[0] as RequestParam) as {
				entries: Array<{ from_path: string; to_path: string }>;
			}
		).entries,
	).toStrictEqual([
		{ from_path: '/old', to_path: '/new' },
		{ from_path: '/p.md', to_path: '/q.md' },
	]);
});

test('the delete batch waits for descendant moves out of the tree', async () => {
	const moveRelease = deferred<Partial<RequestResponse>>();
	const { run } = createHarness((url) => {
		expect(url).toBe(URLS.moveBatch);
		return moveRelease.promise;
	});
	const deleteStatus = spy();
	const { executeAtom, optimized } = run([
		moveAtom('src/x.md', 'dst/x.md', spy()),
		moveAtom('other/y.md', 'third/y.md', spy()),
		deleteAtom('src/', deleteStatus),
	]);
	const pending = Promise.all(optimized.map(executeAtom));

	await flush();
	expect(deleteStatus.executed).toBe(false);
	moveRelease.resolve(json(batchEntries(['/src/x.md', '/other/y.md'])));
	await pending;
	expect(deleteStatus.executed).toBe(true);
});

test('moves with intra-batch dependencies stay individual and ordered', async () => {
	const firstRelease = deferred<void>();
	const first = spy();
	const second = spy();
	const { run } = createHarness(() => {
		throw new Error('No batch request expected');
	});
	const { executeAtom, optimized } = run([
		{
			execute: async () => {
				first.executed = true;
				await firstRelease.promise;
			},
			newKey: 'b/',
			oldKey: 'a/',
			reject: (error) => (first.rejected = error.message),
			resolve: () => (first.resolved = true),
			type: 'move',
		},
		moveAtom('b/c.md', 'd/c.md', second),
	]);
	const pending = Promise.all(optimized.map(executeAtom));

	await flush();
	expect(first.executed).toBe(true);
	expect(second.executed).toBe(false);
	firstRelease.resolve();
	await pending;
	expect(second.executed).toBe(true);
});

test('writes into moved subtrees wait for the move batch', async () => {
	const moveRelease = deferred<Partial<RequestResponse>>();
	const { run } = createHarness((url, params) => {
		expect(url).toBe(URLS.moveBatch);
		const { entries } = bodyOf(params) as { entries: Array<{ from_path: string }> };
		return moveRelease.promise.then(() =>
			json(batchEntries(entries.map(({ from_path }) => from_path))),
		);
	});
	const writeStatus = spy();
	const { executeAtom, optimized } = run([
		moveAtom('src/', 'dst/', spy()),
		moveAtom('other/', 'third/', spy()),
		writeAtom('dst/new.md', writeStatus),
	]);
	const pending = Promise.all(optimized.map(executeAtom));

	await flush();
	expect(writeStatus.executed).toBe(false);
	moveRelease.resolve(json({}));
	await pending;
	expect(writeStatus.executed).toBe(true);
});

test('per-entry batch failures reject only their own atoms', async () => {
	const { run } = createHarness((url, params) => {
		expect(url).toBe(URLS.deleteBatch);
		const { entries } = bodyOf(params) as { entries: Array<{ path: string }> };
		return json(
			batchEntries(
				entries.map(({ path }) => path),
				{ '/blocked.md': 'too_many_write_operations' },
			),
		);
	});
	const okStatus = spy();
	const blocked = spy();
	const { executeAtom, optimized } = run([
		deleteAtom('ok.md', okStatus),
		deleteAtom('blocked.md', blocked),
	]);

	await Promise.all(optimized.map((atom) => executeAtom(atom).catch(() => {})));

	expect(okStatus.resolved).toBe(true);
	expect(blocked.rejected).toContain('too_many_write_operations');
});

test('a batched deletion gates all dependents on the same single call', async () => {
	const deleteRelease = deferred<Partial<RequestResponse>>();
	const batchCalls: Array<string> = [];
	const { run } = createHarness((url) => {
		expect(url).toBe(URLS.deleteBatch);
		batchCalls.push(url);
		return deleteRelease.promise;
	});
	const writeStatus = spy();
	const otherWrite = spy();
	const { executeAtom, optimized } = run([
		deleteAtom('folder/', spy()),
		deleteAtom('other/', spy()),
		writeAtom('folder', writeStatus),
		writeAtom('other', otherWrite),
	]);
	const pending = Promise.all(optimized.map(executeAtom));

	await flush();
	expect(writeStatus.executed).toBe(false);
	expect(otherWrite.executed).toBe(false);
	deleteRelease.resolve(json(batchEntries(['/folder/', '/other/'])));
	await pending;
	expect(writeStatus.executed).toBe(true);
	expect(otherWrite.executed).toBe(true);
	expect(batchCalls.length).toBe(1);
});
