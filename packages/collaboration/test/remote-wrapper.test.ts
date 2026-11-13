import { RaceJournal } from '@/race';
import captureRemoteState from '@/remote-wrapper';
import RemoteStateCache from '@/state-cache';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';

const { bytes, file, fs } = testKit;

function setup() {
	const remote = fs({ control: { read: () => bytes('base'), write: () => 'uploaded-uid' } });
	const stateCache = new RemoteStateCache();
	const journal = new RaceJournal();
	const activeUploads = new Set(['note.md']);
	const wrapped = captureRemoteState(remote.fs, {
		activeUploads,
		enabled: () => true,
		journal,
		stateCache,
	});
	return { activeUploads, journal, remote, stateCache, wrapped };
}

test('journals the upload epoch', async () => {
	const { journal, remote, wrapped } = setup();

	await wrapped.write('note.md', bytes('local'), file('note.md', { size: 5, uid: 'local-uid' }));

	// No base read is performed; the edit is durably captured by the history module instead.
	expect(remote.calls.read).toHaveLength(0);
	expect(journal.get('note.md')).toMatchObject({
		key: 'note.md',
		localUid: 'local-uid',
		remoteUid: 'uploaded-uid',
	});
});

test('does not journal writes outside an upload task', async () => {
	const { activeUploads, journal, wrapped } = setup();
	activeUploads.clear();

	await wrapped.write('note.md', bytes('local'), file('note.md', { size: 5, uid: 'local-uid' }));

	expect(journal.get('note.md')).toBeUndefined();
});

test('marks the local state dirty after writes and moves', async () => {
	const { stateCache, wrapped } = setup();
	expect(stateCache.isDirty('uid')).toBe(false);

	await wrapped.write('other.md', bytes('x'), file('other.md', { size: 1, uid: 'local' }));
	expect(stateCache.isDirty('uid')).toBe(true);
	stateCache.clearDirty('uid');

	await wrapped.move('other.md', 'moved.md');
	expect(stateCache.isDirty('uid')).toBe(true);
});

test('collects changed keys on every mutating remote operation', async () => {
	const { stateCache, wrapped } = setup();
	const stat = file('note.md', { size: 1, uid: 'local' });

	await wrapped.write('a.md', bytes('x'), stat);
	await wrapped.writeStream('b.md', new ReadableStream(), stat);
	await wrapped.mkdir('folder/', { isDir: true, key: 'folder/', meta: () => ({}) });
	await wrapped.move('a.md', 'c.md');
	await wrapped.delete('b.md');

	expect(stateCache.takeChanged('uid')).toStrictEqual(['a.md', 'b.md', 'c.md', 'folder/']);
});
