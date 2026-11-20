import testKit from '$/test-kit';
import { bidirectionalDecider, excludeOversized } from '@/sync';
import { expect, test } from 'bun:test';
import type { Decider } from '@/sync';
import type { RecordStat, Stat } from '@/types';

const { file, fileRecord, folder, runDecider } = testKit;
const MAX = 20;
const decider: Decider = (input) => bidirectionalDecider(input, () => {});

function decide(lists: {
	local: Array<Stat>;
	remote: Array<Stat>;
	records: Array<[string, RecordStat]>;
}) {
	const { local, remote, records } = excludeOversized({ ...lists, maxSize: MAX });
	return runDecider(decider, {
		localStats: new Map(local.map((stat) => [stat.key, stat])),
		records: new Map(records),
		remoteStats: new Map(remote.map((stat) => [stat.key, stat])),
	});
}

test('keeps everything when no file exceeds the limit', () => {
	const lists = {
		local: [folder('dir/'), file('a.md', { size: MAX })],
		records: [['a.md', fileRecord('a.md-uid', 'a.md-uid')] as [string, RecordStat]],
		remote: [file('a.md', { size: MAX })],
	};
	expect(excludeOversized({ ...lists, maxSize: MAX })).toStrictEqual(lists);
});

test('a synced file that grows past the limit on the remote is not removed locally', () => {
	const tasks = decide({
		local: [file('a.pdf', { size: 10, uid: 'old' })],
		records: [['a.pdf', fileRecord('old', 'old')]],
		remote: [file('a.pdf', { size: 30, uid: 'new' })],
	});
	expect(tasks).toStrictEqual([]);
});

test('a synced file that grows past the limit locally is not removed from the remote', () => {
	const tasks = decide({
		local: [file('a.pdf', { size: 30, uid: 'new' })],
		records: [['a.pdf', fileRecord('old', 'old')]],
		remote: [file('a.pdf', { size: 10, uid: 'old' })],
	});
	expect(tasks).toStrictEqual([]);
});

test('without a record the smaller copy does not overwrite the oversized one', () => {
	const tasks = decide({
		local: [file('a.pdf', { size: 10 })],
		records: [],
		remote: [file('a.pdf', { size: 30 })],
	});
	expect(tasks).toStrictEqual([]);
});

test('oversized files on one side only are skipped, other files still sync', () => {
	const tasks = decide({
		local: [file('big-local.mp4', { size: 30 }), file('note.md', { size: 1 })],
		records: [],
		remote: [file('big-remote.mp4', { size: 30 })],
	});
	expect(tasks.map(({ name, key }) => [name, key])).toStrictEqual([['upload', 'note.md']]);
});
