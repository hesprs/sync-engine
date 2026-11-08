import { argOf, bodyOf, json } from './helpers';
import { API_CONTENT, API_RPC } from '@/dropbox/api';
import DropboxFs from '@/dropbox/fs';
import dropboxOptimizer from '@/optimizer';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import type { Control } from './helpers';
import type { FileMetadata } from '@/dropbox/api';
import type {
	InputAtom,
	RequestParam,
	RequestResponse,
	OutputAtom,
	StringKV,
} from '@hesprs/sync-engine-sdk';

const { bytes, deferred, file, flush, request } = testKit;

type AtomSpy = { executed: boolean; rejected?: string; resolved: boolean };

function spy(): AtomSpy {
	return { executed: false, resolved: false };
}

function batchEntries(paths: Array<string>, failures: StringKV = {}) {
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

function fileMeta(name: string): FileMetadata {
	return {
		client_modified: '2024-01-01T10:00:00Z',
		content_hash: `hash-${name}`,
		id: `id:${name}`,
		name,
		rev: `rev-${name}`,
		server_modified: '2024-01-01T10:00:00Z',
		size: 5,
	};
}

function fsWriteAtom(key: string, fs: DropboxFs, status: AtomSpy): InputAtom {
	return {
		execute: () => fs.write(key, bytes(`data-${key}`), file(key, { size: 6 })),
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
	return { calls: harness.calls, fs, run };
}

const URLS = {
	append: `${API_CONTENT}/2/files/upload_session/append_v2`,
	createFolderBatch: `${API_RPC}/2/files/create_folder_batch`,
	deleteBatch: `${API_RPC}/2/files/delete_batch`,
	deleteV2: `${API_RPC}/2/files/delete_v2`,
	finishBatch: `${API_RPC}/2/files/upload_session/finish_batch_v2`,
	moveBatch: `${API_RPC}/2/files/move_batch_v2`,
	startBatch: `${API_RPC}/2/files/upload_session/start_batch`,
	upload: `${API_CONTENT}/2/files/upload`,
};

/**
 * A control answering the session routes: one start_batch, instant appends, and per-entry commit
 * success.
 */
function sessionRoutes(append?: (params: RequestParam) => Partial<RequestResponse>): Control {
	return (url, params) => {
		if (url === URLS.startBatch) {
			const { num_sessions: count } = bodyOf(params) as { num_sessions: number };
			return json({ session_ids: Array.from({ length: count }, (_, index) => `s${index}`) });
		}
		if (url === URLS.append) return append?.(params) ?? json({});
		expect(url).toBe(URLS.finishBatch);
		const { entries } = bodyOf(params) as {
			entries: Array<{ cursor: { session_id: string } }>;
		};
		return json({
			entries: entries.map(({ cursor }) =>
				Object.assign(fileMeta(cursor.session_id), { '.tag': 'success' }),
			),
		});
	};
}

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

test('four writes upload through one session batch and commit together', async () => {
	const { calls, fs, run } = createHarness(sessionRoutes());
	const { executeAtom, optimized } = run(
		['w0.md', 'w1.md', 'w2.md', 'w3.md'].map((key) => fsWriteAtom(key, fs, spy())),
	);
	const writes = optimized.filter((atom) => atom.type === 'write');
	const uids = await Promise.all(writes.map((atom) => executeAtom(atom).then(String, String)));

	expect(uids).toStrictEqual(['hash-s0', 'hash-s1', 'hash-s2', 'hash-s3']);
	expect(calls.map(({ url }) => url)).toStrictEqual([
		URLS.startBatch,
		URLS.append,
		URLS.append,
		URLS.append,
		URLS.append,
		URLS.finishBatch,
	]);
	expect(
		(
			bodyOf(calls.at(-1) as RequestParam) as { entries: Array<{ commit: { path: string } }> }
		).entries
			.map(({ commit }) => commit.path)
			.sort(),
	).toStrictEqual(['/w0.md', '/w1.md', '/w2.md', '/w3.md']);
});

test('three writes stay individual without any session request', async () => {
	const { calls, run } = createHarness(() => {
		throw new Error('No request expected');
	});
	const { executeAtom, optimized } = run([
		writeAtom('a.md', spy()),
		writeAtom('b.md', spy()),
		writeAtom('c.md', spy()),
	]);

	await Promise.all(optimized.map(executeAtom));

	expect(calls.length).toBe(0);
	expect(optimized.filter((atom) => atom.type === 'custom').length).toBe(0);
});

test('a failed append rejects only its write and the commit covers the rest', async () => {
	const { calls, fs, run } = createHarness(
		sessionRoutes((params) =>
			(argOf(params).cursor as { session_id: string }).session_id === 's2'
				? json(
						{
							error: {
								'.tag': 'path',
								path: { '.tag': 'conflict', conflict: { '.tag': 'folder' } },
							},
						},
						409,
					)
				: json({}),
		),
	);
	const statuses = [spy(), spy(), spy(), spy()];
	const { executeAtom, optimized } = run([
		fsWriteAtom('w0.md', fs, statuses[0]),
		fsWriteAtom('w1.md', fs, statuses[1]),
		fsWriteAtom('w2.md', fs, statuses[2]),
		fsWriteAtom('w3.md', fs, statuses[3]),
	]);
	const writes = optimized.filter((atom) => atom.type === 'write');
	const outcomes = await Promise.all(
		writes.map((atom) => executeAtom(atom).then(String, String)),
	);

	expect(outcomes[0]).toBe('hash-s0');
	expect(outcomes[1]).toBe('hash-s1');
	expect(outcomes[2]).toContain('conflict');
	expect(outcomes[3]).toBe('hash-s3');
	expect(statuses[2].rejected).toContain('conflict');
	expect(
		(
			bodyOf(calls.at(-1) as RequestParam) as {
				entries: Array<{ cursor: { session_id: string } }>;
			}
		).entries
			.map(({ cursor }) => cursor.session_id)
			.sort(),
	).toStrictEqual(['s0', 's1', 's3']);
});

test('a write gated by a failed folder creation never uploads and still counts', async () => {
	const { calls, fs, run } = createHarness(sessionRoutes());
	const gated = spy();
	const { executeAtom, optimized } = run([
		{
			execute: () => {
				throw new Error('folder creation failed');
			},
			key: 'd/',
			reject: (error) => (gated.rejected = error.message),
			resolve: () => (gated.resolved = true),
			type: 'mkdir',
		},
		fsWriteAtom('d/x.md', fs, gated),
		fsWriteAtom('a.md', fs, spy()),
		fsWriteAtom('b.md', fs, spy()),
		fsWriteAtom('c.md', fs, spy()),
	]);
	const writes = optimized.filter((atom) => atom.type === 'write');
	const outcomes = await Promise.all(
		writes.map((atom) => executeAtom(atom).then(String, String)),
	);

	expect(outcomes[0]).toContain('folder creation failed');
	expect(calls.filter(({ url }) => url === URLS.append).length).toBe(3);
	expect(
		(
			bodyOf(calls.at(-1) as RequestParam) as { entries: Array<{ commit: { path: string } }> }
		).entries
			.map(({ commit }) => commit.path)
			.sort(),
	).toStrictEqual(['/a.md', '/b.md', '/c.md']);
});

test('a failed session start rejects every write and skips the commit', async () => {
	const { calls, fs, run } = createHarness((url) => {
		expect(url).toBe(URLS.startBatch);
		return json({ error: { '.tag': 'too_many_write_operations' } }, 429);
	});
	const { executeAtom, optimized } = run(
		['w0.md', 'w1.md', 'w2.md', 'w3.md'].map((key) => fsWriteAtom(key, fs, spy())),
	);
	const writes = optimized.filter((atom) => atom.type === 'write');
	const outcomes = await Promise.all(
		writes.map((atom) => executeAtom(atom).then(String, String)),
	);

	expect(outcomes.every((outcome) => outcome.includes('too_many_write_operations'))).toBe(true);
	expect(calls.map(({ url }) => url)).toStrictEqual([URLS.startBatch]);
});

test('ready writes commit in 50-entry chunks plus one key-less remainder', async () => {
	const keys: Array<string> = [];
	for (let index = 0; index < 60; index += 1) keys.push(`w${index}.md`);
	const { calls, fs, run } = createHarness(sessionRoutes());
	const { executeAtom, optimized } = run(keys.map((key) => fsWriteAtom(key, fs, spy())));
	const writes = optimized.filter((atom) => atom.type === 'write');

	await Promise.all(writes.map((atom) => executeAtom(atom).then(String, String)));

	const finishes = calls.filter(({ url }) => url === URLS.finishBatch);
	expect(
		finishes.map((finish) => (bodyOf(finish) as { entries: Array<unknown> }).entries.length),
	).toStrictEqual([50, 10]);
});
