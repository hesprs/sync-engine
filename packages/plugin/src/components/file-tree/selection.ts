import CreateLocalDir from '@/sync/tasks/CreateLocalDir';
import CreateRemoteDir from '@/sync/tasks/CreateRemoteDir';
import MoveLocal from '@/sync/tasks/MoveLocal';
import MoveRemote from '@/sync/tasks/MoveRemote';
import type { FileTreeData, FileTreeNode } from './types';
import type { BaseTask, BaseTaskOptions } from '@/sync';

function isDeleteTask(node: FileTreeNode | undefined): boolean {
	return node?.task?.name === 'removeLocal' || node?.task?.name === 'removeRemote';
}

function usesCreationCascade(node: FileTreeNode | undefined): boolean {
	return node?.task !== undefined && !isDeleteTask(node);
}

function isMoveTask(task: BaseTask | undefined): boolean {
	return task?.name === 'moveLocal' || task?.name === 'moveRemote';
}

function convertMoveToCreateDir(move: BaseTask): BaseTask {
	const name = move.name === 'moveLocal' ? 'createLocalDir' : 'createRemoteDir';
	if (move instanceof MoveLocal || move instanceof MoveRemote) {
		const { oldKey: _, ...options } = move.options as BaseTaskOptions & { oldKey?: string };
		const converted =
			name === 'createLocalDir'
				? new CreateLocalDir(options as never)
				: new CreateRemoteDir(options as never);
		converted.name = name;
		return converted;
	}
	return Object.assign(Object.create(Object.getPrototypeOf(move) as object), move, {
		name,
	}) as BaseTask;
}

function setSelected(
	selectedTaskIds: Set<string>,
	nodeId: string,
	nextSelected: boolean,
	changed: Set<string>,
) {
	const has = selectedTaskIds.has(nodeId);
	if (has === nextSelected) return;
	if (nextSelected) selectedTaskIds.add(nodeId);
	else selectedTaskIds.delete(nodeId);
	changed.add(nodeId);
}

function forEachTaskDescendant(
	data: FileTreeData,
	nodeId: string,
	visit: (nodeId: string) => void,
) {
	for (const childId of data.nodes[nodeId].taskChildIds) {
		visit(childId);
		forEachTaskDescendant(data, childId, visit);
	}
}

function forEachTaskAncestor(data: FileTreeData, nodeId: string, visit: (nodeId: string) => void) {
	let current = data.nodes[nodeId].taskParentId;
	while (current !== undefined) {
		visit(current);
		current = data.nodes[current].taskParentId;
	}
}

export default function createFileTreeSelection(data: FileTreeData): {
	isSelected: (nodeId: string) => boolean;
	getTask: (nodeId: string) => BaseTask | undefined;
	toggle: (nodeId: string, nextSelected: boolean) => Set<string>;
	getState: () => { selected: Array<BaseTask>; deselected: Array<BaseTask> };
} {
	const selectedTaskIds = new Set(data.taskNodeIds);

	function getConversionState(
		nodeId: string,
		wasConverted: boolean,
		converted: Set<string>,
	): boolean {
		const node = data.nodes[nodeId];
		if (!node?.task || !isMoveTask(node.task)) return false;
		if (
			node.taskChildIds.some(
				(childId) =>
					isMoveTask(data.nodes[childId]?.task) &&
					(!selectedTaskIds.has(childId) || converted.has(childId)),
			)
		)
			return true;
		if (!wasConverted) return false;
		const reversible =
			node.taskChildIds.length > 0 &&
			node.taskChildIds.every((childId) => {
				const child = data.nodes[childId];
				return (
					child.task !== undefined &&
					isMoveTask(child.task) &&
					selectedTaskIds.has(childId) &&
					!converted.has(childId)
				);
			});
		return !reversible;
	}

	function computeConversions(previous: Set<string>): Set<string> {
		const converted = new Set(previous);
		let changed = true;
		while (changed) {
			changed = false;
			for (const nodeId of data.taskNodeIds) {
				const wasConverted = converted.has(nodeId);
				const next = getConversionState(nodeId, wasConverted, converted);
				if (next !== wasConverted) {
					if (next) converted.add(nodeId);
					else converted.delete(nodeId);
					changed = true;
				}
			}
		}
		return converted;
	}

	let convertedIds = computeConversions(new Set<string>());

	return {
		getState() {
			const selected: Array<BaseTask> = [];
			const deselected: Array<BaseTask> = [];
			for (const taskNodeId of data.taskNodeIds) {
				const task = getTask(taskNodeId);
				if (!task) continue;
				if (selectedTaskIds.has(taskNodeId)) selected.push(task);
				else deselected.push(task);
			}
			return { deselected, selected };
		},
		getTask,
		isSelected(nodeId: string) {
			return selectedTaskIds.has(nodeId);
		},
		toggle(nodeId: string, nextSelected: boolean) {
			const changed = new Set<string>();
			const node = data.nodes[nodeId];
			if (!node?.task) return changed;

			setSelected(selectedTaskIds, nodeId, nextSelected, changed);

			if (!nextSelected && node.isCreateFolderTask)
				forEachTaskDescendant(data, nodeId, (descendantId) => {
					if (usesCreationCascade(data.nodes[descendantId]))
						setSelected(selectedTaskIds, descendantId, false, changed);
				});
			else if (nextSelected && node.isDeleteFolderTask)
				forEachTaskDescendant(data, nodeId, (descendantId) => {
					if (isDeleteTask(data.nodes[descendantId]))
						setSelected(selectedTaskIds, descendantId, true, changed);
				});

			if (nextSelected && usesCreationCascade(node))
				forEachTaskAncestor(data, nodeId, (ancestorId) => {
					if (data.nodes[ancestorId].isCreateFolderTask)
						setSelected(selectedTaskIds, ancestorId, true, changed);
				});
			else if (!nextSelected && isDeleteTask(node))
				forEachTaskAncestor(data, nodeId, (ancestorId) => {
					if (data.nodes[ancestorId].isDeleteFolderTask)
						setSelected(selectedTaskIds, ancestorId, false, changed);
				});

			convertedIds = computeConversions(convertedIds);

			return changed;
		},
	};

	function getTask(nodeId: string): BaseTask | undefined {
		const node = data.nodes[nodeId];
		if (!node?.task) return;
		return convertedIds.has(nodeId) ? convertMoveToCreateDir(node.task) : node.task;
	}
}
