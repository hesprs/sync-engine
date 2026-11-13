import { RaceJournal } from '@/race';
import SyncBridge from '@/sync-bridge';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import { openMemoryDB } from 'uni-kv';
import type { Pulse } from '@/protocol';
import type { GlobStrategy } from '@/types';
import type {
	DatabaseSync,
	DeciderEntry,
	Dispatch,
	Events,
	Fs,
	On,
	Stat,
} from '@hesprs/sync-engine-sdk';

const { file } = testKit;
const rules: Array<GlobStrategy> = [{ expr: '*', strategy: 'bidirectional' }];

type TestDB = DatabaseSync<{ remoteContext20000: Stat }, Record<string, never>>;

function pulse(overrides: Partial<Pulse> = {}): Pulse {
	return { batchId: 'batch', clientId: 'peer', sentAt: Date.now(), ...overrides };
}

function setup() {
	const listeners = new Map<keyof Events, Set<(payload: never) => void>>();
	const on = ((event: keyof Events, listener: (payload: never) => void) => {
		let set = listeners.get(event);
		if (!set) {
			set = new Set();
			listeners.set(event, set);
		}
		set.add(listener);
		return () => set.delete(listener);
	}) as On<Events>;
	const dispatched: Array<{ event: string; payload: unknown }> = [];
	const dispatch = ((event: string, payload?: unknown) => {
		dispatched.push({ event, payload });
	}) as Dispatch<Events>;
	const registry = new Map<string, DeciderEntry>([
		[
			'bidirectional',
			{
				decider: (input) => {
					const local = input.localStats.get('note.md');
					const remote = input.remoteStats.get('note.md');
					if (!local || !remote || local.isDir || remote.isDir) return [];
					return [
						input.taskFactory('resolveConflict', { key: 'note.md', local, remote }),
					];
				},
			},
		],
	]);
	const journal = new RaceJournal();
	const memoryDB = openMemoryDB(`collab-bridge-${crypto.randomUUID()}`) as TestDB;
	const bridge = new SyncBridge(
		{
			deciderRegistry: registry,
			dispatch,
			getConflictResolver: () => () => {},
			memoryDB,
			on,
			registerDecider: (id, entry) => {
				registry.set(id, entry);
				return () => registry.delete(id);
			},
			requestSync: () => Promise.resolve({ result: 'noop' }),
			translate: ((key: string) => key) as never,
		},
		{ journal, rules: () => rules },
	);
	return { bridge, dispatched, journal, memoryDB, registry };
}

/** Stands in for the wrapped remote Fs: exists()/stat() read the current backend state. */
function fakeRemoteFs(current: Map<string, Stat>): Fs {
	return {
		exists: (key: string) => Promise.resolve(current.has(key)),
		stat: (key: string) => {
			const stat = current.get(key);
			if (!stat) return Promise.reject(new Error(`Missing ${key}`));
			return Promise.resolve(stat);
		},
	} as Fs;
}

test('a keyless pulse falls back to the full remote walk', () => {
	const { bridge } = setup();
	bridge.accept(pulse());
	const options = bridge.triggerOptions();
	expect(options?.remoteLister).toBeUndefined();
	expect(options?.syncStrategy).toStrictEqual([
		{ expr: '*', strategy: 'collaboration:bidirectional' },
	]);
	expect(options?.conflictResolver).toBeDefined();
	bridge.dispose();
});

test('a keyless pulse with fastMode enabled uses the cached snapshot instead of a full walk', () => {
	const { memoryDB, registry } = setup();
	memoryDB.getStore('remoteContext20000').set('cached.md', file('cached.md'));
	const bridge = new SyncBridge(
		{
			deciderRegistry: registry,
			dispatch: () => {},
			getConflictResolver: () => () => {},
			memoryDB,
			on: () => () => {},
			registerDecider: () => () => true,
			requestSync: () => Promise.resolve({ result: 'noop' }),
			translate: ((key: string) => key) as never,
		},
		{
			fastMode: () => true,
			journal: new RaceJournal(),
			rules: () => [{ expr: '*', strategy: 'bidirectional' }],
		},
	);
	bridge.accept(pulse());
	const options = bridge.triggerOptions();
	expect(options?.remoteLister).toBeDefined();
	bridge.dispose();
});

test('changed keys with an empty snapshot fall back to the full remote walk', () => {
	const { bridge } = setup();
	bridge.accept(pulse({ keys: ['note.md'] }));
	const options = bridge.triggerOptions();
	expect(options?.remoteLister).toBeUndefined();
	bridge.dispose();
});

test('changed keys with a populated snapshot produce an incremental lister', () => {
	const { bridge, memoryDB } = setup();
	memoryDB.getStore('remoteContext20000').set('note.md', file('note.md'));
	bridge.accept(pulse({ keys: ['note.md'] }));
	const options = bridge.triggerOptions();
	expect(options?.remoteLister).toBeDefined();
	bridge.dispose();
});

test('the incremental lister returns a complete stat array', async () => {
	const { bridge, memoryDB } = setup();
	const store = memoryDB.getStore('remoteContext20000');
	store.set('unchanged.md', file('unchanged.md', { uid: 'u1' }));
	store.set('changed.md', file('changed.md', { uid: 'old' }));
	store.set('deleted.md', file('deleted.md', { uid: 'd1' }));
	const current = new Map<string, Stat>([
		['unchanged.md', file('unchanged.md', { uid: 'u1' })],
		['changed.md', file('changed.md', { uid: 'new' })],
		['new.md', file('new.md', { uid: 'n1' })],
	]);
	const remoteFs = fakeRemoteFs(current);
	bridge.accept(pulse({ keys: ['changed.md', 'deleted.md', 'new.md'] }));
	const lister = bridge.triggerOptions()?.remoteLister;
	expect(lister).toBeDefined();
	const stats = await lister?.({
		localFs: {} as Fs,
		record: {} as never,
		remoteFs,
		reporter: () => 'include',
	});
	const byKey = new Map(stats?.map((stat) => [stat.key, stat]));
	// Unchanged keys survive, changed keys are refreshed, new keys appear, deletes are removed.
	expect(byKey.has('unchanged.md')).toBe(true);
	expect(byKey.get('changed.md')).toMatchObject({ uid: 'new' });
	expect(byKey.has('new.md')).toBe(true);
	expect(byKey.has('deleted.md')).toBe(false);
	bridge.dispose();
});

test('the incremental lister honors reporter exclusions', async () => {
	const { bridge, memoryDB } = setup();
	const store = memoryDB.getStore('remoteContext20000');
	store.set('keep.md', file('keep.md'));
	store.set('drop.md', file('drop.md'));
	const remoteFs = fakeRemoteFs(new Map<string, Stat>([['keep.md', file('keep.md')]]));
	bridge.accept(pulse({ keys: ['keep.md'] }));
	const lister = bridge.triggerOptions()?.remoteLister;
	const stats = await lister?.({
		localFs: {} as Fs,
		record: {} as never,
		remoteFs,
		reporter: ({ current }) => (current === 'drop.md' ? 'exclude' : 'include'),
	});
	expect(stats?.map((stat) => stat.key)).toStrictEqual(['keep.md']);
	bridge.dispose();
});

test('the incremental lister falls back to remoteFs.list on patch error', async () => {
	const { bridge, memoryDB } = setup();
	const store = memoryDB.getStore('remoteContext20000');
	store.set('note.md', file('note.md'));
	const remoteFs = {
		exists: () => Promise.reject(new Error('backend network failure')),
		list: () => Promise.resolve([file('fallback.md')]),
	} as unknown as Fs;
	bridge.accept(pulse({ keys: ['note.md'] }));
	const lister = bridge.triggerOptions()?.remoteLister;
	expect(lister).toBeDefined();
	const stats = await lister?.({
		localFs: {} as Fs,
		record: {} as never,
		remoteFs,
		reporter: () => 'include',
	});
	expect(stats?.map((s) => s.key)).toStrictEqual(['fallback.md']);
	bridge.dispose();
});

test('race forcing is unconditional: the incremental lister and sync strategy are both present', () => {
	const { bridge, memoryDB } = setup();
	memoryDB.getStore('remoteContext20000').set('note.md', file('note.md'));
	const fresh = new SyncBridge(
		{
			deciderRegistry: new Map(),
			dispatch: () => {},
			getConflictResolver: () => () => {},
			memoryDB,
			on: () => () => false,
			registerDecider: () => () => false,
			requestSync: () => Promise.resolve({ result: 'noop' }),
			translate: ((key: string) => key) as never,
		},
		{ journal: new RaceJournal(), rules: () => rules },
	);
	fresh.accept(pulse({ keys: ['note.md'] }));
	const options = fresh.triggerOptions();
	expect(options?.remoteLister).toBeDefined();
	expect(options?.syncStrategy).toStrictEqual([{ expr: '*', strategy: 'bidirectional' }]);
	expect(options?.conflictResolver).toBeDefined();
	fresh.dispose();
	bridge.dispose();
});

test('drops pending collaboration state on reset', () => {
	const { bridge } = setup();
	bridge.accept(pulse());
	expect(bridge.triggerOptions()).toBeDefined();
	bridge.accept(pulse());
	bridge.reset();
	expect(bridge.triggerOptions()).toBeUndefined();
	bridge.dispose();
});

test('keeps only the newest pulse by sentAt then batchId', () => {
	const { bridge } = setup();
	const now = Date.now();
	bridge.accept(pulse({ batchId: 'newer', sentAt: now }));
	bridge.accept(pulse({ batchId: 'older', sentAt: now - 1000 }));
	const options = bridge.triggerOptions();
	expect(options).toBeDefined();
	// A stale pulse must not leave a second pending sync behind.
	expect(bridge.triggerOptions()).toBeUndefined();
	bridge.dispose();
});

test('the wrapped decider fills candidates from the real remote listing', () => {
	const { bridge, dispatched, journal, registry } = setup();
	const now = Date.now();
	journal.record({
		key: 'note.md',
		localUid: 'local-uid',
		remoteUid: 'remote-old',
		uploadedAt: now,
	});
	bridge.accept(pulse());
	const options = bridge.triggerOptions();
	const wrapped = registry.get('collaboration:bidirectional');
	expect(wrapped).toBeDefined();
	const local = file('note.md', { size: 20, uid: 'local-uid' });
	const remote = file('note.md', { mtime: now, size: 20, uid: 'remote-new' });
	wrapped?.decider({
		localStats: new Map([['note.md', local]]),
		records: new Map([['note.md', { isDir: false, local: 'local-uid', remote: 'remote-old' }]]),
		remoteStats: new Map([['note.md', remote]]),
		taskFactory: ((name: string, taskOptions: object) => ({ name, ...taskOptions })) as never,
	});
	// The resolver closes over this very map instance, so seeing the candidate here proves the
	// Decider -> resolver hand-off works despite buildOptions() running before decideTasks().
	expect(
		(bridge as unknown as { activeCandidates: Map<string, unknown> }).activeCandidates.size,
	).toBe(1);
	expect(dispatched.some((entry) => entry.event === 'logSync')).toBe(true);
	expect(options?.conflictResolver).toBeDefined();
	bridge.dispose();
});
