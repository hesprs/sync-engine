import { getTaskSide } from '../tasks/interface';
import MoveLocal from '../tasks/MoveLocal';
import MoveRemote from '../tasks/MoveRemote';
import { basename, dirname } from '@repo/shared/path';
import type { Task } from '../tasks/interface';
import type {
	CreateLocalDir,
	CreateRemoteDir,
	Download,
	RemoveLocal,
	RemoveRemote,
	Upload,
} from '@/sdk';
import type { RecordStatsMap, Stat } from '@/types';

type MoveSide = 'local' | 'remote';
type MoveInfo = { key: string; newKey: string; side: MoveSide };
type DeleteCandidate = { side: MoveSide; task: RemoveLocal | RemoveRemote; uid?: string };
type CreateCandidate = {
	side: MoveSide;
	task: Download | CreateLocalDir | Upload | CreateRemoteDir;
	stat: Stat;
	uid?: string;
};
type Pair = { create: CreateCandidate; delete: DeleteCandidate };

export default function convertMoves(tasks: Array<Task>, records: RecordStatsMap): Array<Task> {
	let result = collapseFileMoves(tasks, records);
	while (true) {
		const pair = findFolderPairs(result, records)
			.sort((a, b) => b.delete.task.key.length - a.delete.task.key.length)
			.find((folder) => canCollapseFolder(folder, result));
		if (!pair) return result;
		result = [
			...result.filter((task) => task !== pair.delete.task && task !== pair.create.task),
			createMoveTask(pair),
		];
	}
}

function collapseFileMoves(tasks: Array<Task>, records: RecordStatsMap) {
	const deletes = tasks.map((task) => getDeleteCandidate(task, false, records)).filter(defined);
	const creates = tasks.map((task) => getCreateCandidate(task, false)).filter(defined);
	const paired = new Set<Task>();
	const moves: Array<Task> = [];
	for (const deleted of deletes) {
		const created = creates.find(
			(candidate) =>
				!paired.has(candidate.task) &&
				candidate.side === deleted.side &&
				candidate.uid === deleted.uid,
		);
		if (!created || deleted.task.key === created.task.key) continue;
		paired.add(deleted.task);
		paired.add(created.task);
		moves.push(createMoveTask({ create: created, delete: deleted }));
	}
	return [...tasks.filter((task) => !paired.has(task)), ...moves];
}

function getDeleteCandidate(
	task: Task,
	isFolder: boolean,
	records: RecordStatsMap,
): DeleteCandidate | undefined {
	if (task.name !== 'removeLocal' && task.name !== 'removeRemote') return;
	const isLocal = task.name === 'removeLocal';
	const side = isLocal ? 'local' : 'remote';
	if ((isLocal ? task.local : task.remote).isDir !== isFolder) return;
	if (isFolder) return { side, task };
	const record = records.get(task.key);
	const uid = record?.isDir === false ? (isLocal ? record.remote : record.local) : undefined;
	return uid === undefined ? undefined : { side, task, uid };
}

function getCreateCandidate(task: Task, isFolder: boolean): CreateCandidate | undefined {
	if (isFolder) {
		if (task.name !== 'createLocalDir' && task.name !== 'createRemoteDir') return;
		const isLocal = task.name === 'createLocalDir';
		return {
			side: isLocal ? 'local' : 'remote',
			stat: isLocal ? task.remote : task.local,
			task,
		};
	}
	if (task.name !== 'download' && task.name !== 'upload') return;
	const isLocal = task.name === 'download';
	const stat = isLocal ? task.remote : task.local;
	return { side: isLocal ? 'local' : 'remote', stat, task, uid: stat.uid };
}

function findFolderPairs(tasks: Array<Task>, records: RecordStatsMap) {
	const deletes = tasks.map((task) => getDeleteCandidate(task, true, records)).filter(defined);
	const creates = tasks.map((task) => getCreateCandidate(task, true)).filter(defined);
	return deletes.flatMap((deleted) => {
		const destinations = new Set(
			tasks.flatMap((task) => {
				const move = getMoveInfo(task);
				return move?.side === deleted.side && dirname(move.key) === deleted.task.key
					? [dirname(move.newKey)]
					: [];
			}),
		);
		if (destinations.size !== 1) return [];
		const created = creates.find(
			(candidate) =>
				candidate.side === deleted.side && candidate.task.key === [...destinations][0],
		);
		return created ? [{ create: created, delete: deleted }] : [];
	});
}

function canCollapseFolder(pair: Pair, tasks: Array<Task>) {
	const children = tasks.filter(
		(task) =>
			getTaskSide(task.name) === pair.delete.side &&
			dirname(getMoveInfo(task)?.key ?? task.key) === pair.delete.task.key,
	);
	if (children.length === 0) return false;
	return children.every((task) => {
		const move = getMoveInfo(task);
		return (
			move !== undefined &&
			move.side === pair.delete.side &&
			dirname(move.newKey) === pair.create.task.key &&
			basename(move.key) === basename(move.newKey)
		);
	});
}

function createMoveTask({ create, delete: remove }: Pair) {
	return create.side === 'local'
		? new MoveLocal({ ...remove.task.options, newKey: create.task.key, remote: create.stat })
		: new MoveRemote({ ...remove.task.options, local: create.stat, newKey: create.task.key });
}

function getMoveInfo(task: Task): MoveInfo | undefined {
	if (task.name === 'moveLocal') return { ...task.options, side: 'local' };
	if (task.name === 'moveRemote') return { ...task.options, side: 'remote' };
}

function defined<T>(value: T | undefined): value is T {
	return value !== undefined;
}
