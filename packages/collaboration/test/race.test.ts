import {
	createRaceAwareResolver,
	findRaceCandidates,
	forceRaceConflicts,
	RaceJournal,
} from '@/race';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import type { UploadEpoch } from '@/race';
import type {
	ConflictResolver,
	DeciderInput,
	RecordStatsMap,
	StatsMap,
} from '@hesprs/sync-engine-sdk';

const { file } = testKit;

function epoch(overrides: Partial<UploadEpoch> = {}): UploadEpoch {
	return {
		key: 'note.md',
		localUid: 'local-u',
		remoteUid: 'remote-old',
		uploadedAt: Date.now(),
		...overrides,
	};
}

test('finds only real-listing overwrites with a different remote uid', () => {
	const journal = new RaceJournal();
	const item = epoch();
	journal.record(item);
	const now = item.uploadedAt + 1000;
	const remoteStats = (uid: string, mtime = now): StatsMap =>
		new Map([['note.md', file('note.md', { mtime, size: 20, uid })]]);

	expect(findRaceCandidates({ journal, remoteStats: remoteStats('remote-new') }).size).toBe(1);
	// The peer still advertises the uid we uploaded: no race.
	expect(findRaceCandidates({ journal, remoteStats: remoteStats('remote-old') }).size).toBe(0);
	// A stale listing outside the mtime window is not a race.
	expect(
		findRaceCandidates({ journal, remoteStats: remoteStats('remote-new', now + 60_000) }).size,
	).toBe(0);
	// Only journal keys are examined, no matter how large the vault is.
	const large: StatsMap = new Map(remoteStats('remote-new'));
	for (let index = 0; index < 100; index++) {
		const key = `other-${index}.md`;
		large.set(key, file(key, { size: 1, uid: `u${index}` }));
	}
	expect(findRaceCandidates({ journal, remoteStats: large }).size).toBe(1);
});

test('forces a conflict only when record and local stat still match the upload', () => {
	const item = epoch();
	const localStats: StatsMap = new Map([
		['note.md', file('note.md', { size: 14, uid: 'local-u' })],
	]);
	const remoteStats: StatsMap = new Map([
		['note.md', file('note.md', { size: 14, uid: 'remote-new' })],
	]);
	const records: RecordStatsMap = new Map([
		['note.md', { isDir: false, local: 'local-u', remote: 'remote-old' }],
	]);
	const input = {
		localStats,
		records,
		remoteStats,
		taskFactory: (() => {}) as never,
	} satisfies DeciderInput;
	const result = forceRaceConflicts(input, new Map([['note.md', item]]));

	expect(result.forcedKeys.has('note.md')).toBe(true);
	expect(result.records.get('note.md')?.isDir).toBe(false);
	expect(records.get('note.md')).toStrictEqual({
		isDir: false,
		local: 'local-u',
		remote: 'remote-old',
	});

	const changed = forceRaceConflicts(
		{
			...input,
			records: new Map([['note.md', { isDir: false, local: 'other', remote: 'remote-old' }]]),
		},
		new Map([['note.md', item]]),
	);
	expect(changed.forcedKeys.size).toBe(0);
});

test('createRaceAwareResolver delegates every conflict to the configured resolver', async () => {
	let called = 0;
	const configured: ConflictResolver = (payload) => {
		called++;
		expect(payload.key).toBe('note.md');
		return Promise.resolve();
	};
	const resolver = createRaceAwareResolver({ getConfiguredResolver: () => configured });
	await resolver({
		key: 'note.md',
		local: file('note.md', { size: 11, uid: 'local-u' }),
		localFs: {} as never,
		record: {} as never,
		remote: file('note.md', { size: 7, uid: 'remote-new' }),
		remoteFs: {} as never,
	});
	expect(called).toBe(1);
});
