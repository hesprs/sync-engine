import type { FileTreeData, FileTreeNode } from './types';
import type { BaseTask } from '@/sync';

function isDeleteTask(node: FileTreeNode | undefined): boolean {
	return node?.task?.name === 'removeLocal' || node?.task?.name === 'removeRemote';
}

function usesCreationCascade(node: FileTreeNode | undefined): boolean {
	return node?.task !== undefined && !isDeleteTask(node);
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

export default function createFileTreeSelection(data: FileTreeData): {
	isSelected: (nodeId: string) => boolean;
	toggle: (nodeId: string, nextSelected: boolean) => Set<string>;
	getState: () => { selected: Array<BaseTask>; deselected: Array<BaseTask> };
} {
	const selectedTaskIds = new Set(data.taskNodeIds);

	return {
		getState() {
			const selected: Array<BaseTask> = [];
			const deselected: Array<BaseTask> = [];
			for (const taskNodeId of data.taskNodeIds) {
				const task = data.nodes[taskNodeId]?.task;
				if (!task) continue;
				if (selectedTaskIds.has(taskNodeId)) selected.push(task);
				else deselected.push(task);
			}
			return { deselected, selected };
		},
		isSelected(nodeId: string) {
			return selectedTaskIds.has(nodeId);
		},
		toggle(nodeId: string, nextSelected: boolean) {
			const changed = new Set<string>();
			const node = data.nodes[nodeId];
			if (!node?.task) return changed;

			setSelected(selectedTaskIds, nodeId, nextSelected, changed);

			if (node.isCreateFolderTask) {
				if (!nextSelected)
					for (const descendantId of node.selectableDescendantTaskIds)
						if (usesCreationCascade(data.nodes[descendantId]))
							setSelected(selectedTaskIds, descendantId, false, changed);
			} else if (node.isDeleteFolderTask && nextSelected)
				for (const descendantId of node.selectableDescendantTaskIds)
					if (isDeleteTask(data.nodes[descendantId]))
						setSelected(selectedTaskIds, descendantId, true, changed);

			if (nextSelected && usesCreationCascade(node))
				for (const ancestorId of node.ancestorCreateFolderTaskIds)
					setSelected(selectedTaskIds, ancestorId, true, changed);
			else if (isDeleteTask(node))
				for (const ancestorId of node.ancestorDeleteFolderTaskIds)
					setSelected(selectedTaskIds, ancestorId, false, changed);

			return changed;
		},
	};
}
