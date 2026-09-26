import { basename, dirname } from '@repo/shared/path';
import type { RecordStatsMap, Stat } from '@/types';
import type { TaskNames } from '../tasks/interface';
import { BaseTask } from '../tasks/interface';
import MoveLocal from '../tasks/MoveLocal';
import MoveRemote from '../tasks/MoveRemote';

type MoveSide = 'local' | 'remote';
type MoveInfo = { key: string; oldKey: string; side: MoveSide };
type Candidate = { key: string; side: MoveSide; task: BaseTask; uid?: string };
type FolderPair = { create: Candidate; delete: Candidate; newKey: string };

export default function convertMoves(
	tasks: Array<BaseTask>,
	translate: (name: TaskNames) => string,
	records: RecordStatsMap,
): Array<BaseTask> {
	let result = collapseFileMoves(tasks, translate, records);
	while (true) {
		const pair = findFolderPairs(result)
			.sort((a, b) => b.delete.key.length - a.delete.key.length)
			.find((folder) => canCollapseFolder(folder, result));
		if (!pair) return result;
		result = replacePair(
			result,
			pair.delete.task,
			pair.create.task,
			createMoveTask(pair.delete.task, pair.create.task, pair.delete.side, translate),
		);
	}
}

function collapseFileMoves(
	tasks: Array<BaseTask>,
	translate: (name: TaskNames) => string,
	records: RecordStatsMap,
) {
	const deletes = tasks.map((task) => getCandidate(task, false, false, records)).filter(defined);
	const creates = tasks.map((task) => getCandidate(task, true, false, records)).filter(defined);
	const paired = new Set<BaseTask>();
	const moves: Array<BaseTask> = [];
	for (const deleted of deletes) {
		const created = creates.find(
			(task) =>
				!paired.has(task.task) && task.side === deleted.side && task.uid === deleted.uid,
		);
		if (!created || deleted.task.key === created.task.key) continue;
		paired.add(deleted.task);
		paired.add(created.task);
		moves.push(createMoveTask(deleted.task, created.task, deleted.side, translate));
	}
	return [...tasks.filter((task) => !paired.has(task)), ...moves];
}

function getCandidate(
	task: BaseTask,
	isCreate: boolean,
	isFolder: boolean,
	records?: RecordStatsMap,
): Candidate | undefined {
	const side = getSide(task);
	if (!side) return;
	const expected = isFolder
		? isCreate
			? side === 'local'
				? 'createLocalDir'
				: 'createRemoteDir'
			: side === 'local'
				? 'removeLocal'
				: 'removeRemote'
		: isCreate
			? side === 'local'
				? 'download'
				: 'upload'
			: side === 'local'
				? 'removeLocal'
				: 'removeRemote';
	if (task.name !== expected) return;
	const stat = getTaskStat(task, side, isCreate);
	if (!stat || stat.isDir !== isFolder) return;
	if (isFolder) return { key: task.key, side, task };
	if (stat.isDir) return;
	const record = records?.get(task.key);
	const uid = isCreate
		? stat.uid
		: record?.isDir === false
			? side === 'local'
				? record.remote
				: record.local
			: undefined;
	return uid === undefined ? undefined : { key: task.key, side, task, uid };
}

function findFolderPairs(tasks: Array<BaseTask>) {
	const deletes = tasks.map((task) => getCandidate(task, false, true)).filter(defined);
	const creates = tasks.map((task) => getCandidate(task, true, true)).filter(defined);
	return deletes.flatMap((deleted) => {
		const destinations = new Set(
			tasks.flatMap((task) => {
				const move = getMoveInfo(task);
				return move?.side === deleted.side && dirname(move.oldKey) === deleted.key
					? [dirname(move.key)]
					: [];
			}),
		);
		if (destinations.size !== 1) return [];
		const newKey = [...destinations][0];
		const created = creates.find((task) => task.side === deleted.side && task.key === newKey);
		return created ? [{ create: created, delete: deleted, newKey }] : [];
	});
}

function canCollapseFolder(pair: FolderPair, tasks: Array<BaseTask>) {
	const children = tasks.filter(
		(task) =>
			getSide(task) === pair.delete.side &&
			dirname(getMoveInfo(task)?.oldKey ?? task.key) === pair.delete.key,
	);
	if (children.length === 0) return false;
	return children.every((task) => {
		const move = getMoveInfo(task);
		return (
			move !== undefined &&
			move.side === pair.delete.side &&
			dirname(move.key) === pair.newKey &&
			basename(move.oldKey) === basename(move.key) &&
			tasks.some((candidate) => candidate.key === move.key)
		);
	});
}

function getSide(task: BaseTask): MoveSide | undefined {
	if (task.name === 'download' || task.name === 'createLocalDir' || task.name.endsWith('Local'))
		return 'local';
	if (task.name === 'upload' || task.name === 'createRemoteDir' || task.name.endsWith('Remote'))
		return 'remote';
}

function getTaskStat(task: BaseTask, side: MoveSide, isCreate: boolean): Stat | undefined {
	if (side === 'local') return isCreate ? task.remote : task.local;
	return isCreate ? task.local : task.remote;
}

function defined<T>(value: T | undefined): value is T {
	return value !== undefined;
}

function createMoveTask(
	deleteTask: BaseTask,
	createTask: BaseTask,
	side: MoveSide,
	translate: (name: TaskNames) => string,
) {
	const name = side === 'local' ? 'moveLocal' : 'moveRemote';
	const move =
		side === 'local'
			? new MoveLocal({ ...createTask.options, oldKey: deleteTask.key } as never)
			: new MoveRemote({ ...createTask.options, oldKey: deleteTask.key } as never);
	move.name = name;
	move.prettyName = translate(name);
	return move;
}

function replacePair(
	tasks: Array<BaseTask>,
	deleteTask: BaseTask,
	createTask: BaseTask,
	move: BaseTask,
) {
	return [...tasks.filter((task) => task !== deleteTask && task !== createTask), move];
}

function getMoveInfo(task: BaseTask): MoveInfo | undefined {
	const oldKey = (task.options as { oldKey?: unknown }).oldKey;
	if (typeof oldKey !== 'string') return;
	if (task.name === 'moveLocal') return { key: task.key, oldKey, side: 'local' };
	if (task.name === 'moveRemote') return { key: task.key, oldKey, side: 'remote' };
}
