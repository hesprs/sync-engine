import CreateLocalDir from '@/sync/tasks/CreateLocalDir';
import CreateRemoteDir from '@/sync/tasks/CreateRemoteDir';
import { createStore } from 'solid-js/store';
import type { FileTreeData, FileTreeNode } from './types';
import type { Task, MoveLocal, MoveRemote } from '@/sync';

function isMoveTask(task?: Task): task is MoveLocal | MoveRemote {
	return task?.name === 'moveLocal' || task?.name === 'moveRemote';
}

function isRemoveTask(task?: Task): boolean {
	return task?.name === 'removeLocal' || task?.name === 'removeRemote';
}

function isCreateFolderNode(node: FileTreeNode): boolean {
	return node.isFolderTask && !isRemoveTask(node.task);
}

function isRemoveFolderNode(node: FileTreeNode): boolean {
	return node.isFolderTask && isRemoveTask(node.task);
}

function usesCreationCascade(node: FileTreeNode): boolean {
	return node.task !== undefined && !isRemoveTask(node.task);
}

function convertMoveToCreateDir({
	name,
	options,
}: MoveLocal | MoveRemote): CreateLocalDir | CreateRemoteDir {
	// The old key is meaningless to a folder creation, and the stat only needs to be a folder.
	const { oldKey: _, ...rest } = options;
	const ops = Object.assign(rest, { local: { isDir: true }, remote: { isDir: true } }) as never;
	return name === 'moveLocal' ? new CreateLocalDir(ops) : new CreateRemoteDir(ops);
}

export default function createFileTreeSelection(data: FileTreeData) {
	const [selected, setSelected] = createStore<Record<string, boolean>>(
		Object.fromEntries(data.taskNodeIds.map((taskNodeId) => [taskNodeId, true])),
	);
	const isSelected = (nodeId: string) => selected[nodeId] ?? false;

	function getTask(nodeId: string): Task | undefined {
		const { task, taskChildIds } = data.nodes[nodeId];
		return isMoveTask(task) &&
			taskChildIds.some(
				(childId) => !isSelected(childId) && isMoveTask(data.nodes[childId].task),
			)
			? convertMoveToCreateDir(task)
			: task;
	}

	function setSelection(nodeId: string, nextSelected: boolean) {
		if (isSelected(nodeId) !== nextSelected) setSelected(nodeId, nextSelected);
	}

	function forEachTaskDescendant(nodeId: string, visit: (nodeId: string) => void) {
		for (const descendantId of data.nodes[nodeId].taskChildIds) visit(descendantId);
	}

	function forEachTaskAncestor(nodeId: string, visit: (nodeId: string) => void) {
		let current = data.nodes[nodeId].taskParentId;
		while (current !== undefined) {
			visit(current);
			current = data.nodes[current].taskParentId;
		}
	}

	return {
		getState() {
			const selectedTasks: Array<Task> = [];
			const deselected: Array<Task> = [];
			for (const taskNodeId of data.taskNodeIds) {
				const task = getTask(taskNodeId);
				if (!task) continue;
				if (isSelected(taskNodeId)) selectedTasks.push(task);
				else deselected.push(task);
			}
			return { deselected, selected: selectedTasks };
		},
		getTask,
		isSelected,
		toggle(nodeId: string, nextSelected: boolean) {
			const node = data.nodes[nodeId];
			if (!node?.task) return;

			setSelection(nodeId, nextSelected);

			if (!nextSelected && isCreateFolderNode(node))
				forEachTaskDescendant(nodeId, (descendantId) => {
					if (usesCreationCascade(data.nodes[descendantId]))
						setSelection(descendantId, false);
				});
			else if (nextSelected && isRemoveFolderNode(node))
				forEachTaskDescendant(nodeId, (descendantId) => {
					if (isRemoveTask(data.nodes[descendantId].task))
						setSelection(descendantId, true);
				});

			if (nextSelected && usesCreationCascade(node))
				forEachTaskAncestor(nodeId, (ancestorId) => {
					if (isCreateFolderNode(data.nodes[ancestorId])) setSelection(ancestorId, true);
				});
			else if (!nextSelected && isRemoveTask(node.task))
				forEachTaskAncestor(nodeId, (ancestorId) => {
					if (isRemoveFolderNode(data.nodes[ancestorId])) setSelection(ancestorId, false);
				});
		},
	};
}
