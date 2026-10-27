import type { FileTreeData, FileTreeNode } from './types';
import type { BaseTask } from '@/sync';

const ROOT_NODE_ID = '__root__';

type InternalNode = {
	name: string;
	childIds: Array<string>;
	task?: BaseTask;
	isFolderTask: boolean;
	isCreateFolderTask: boolean;
	isDeleteFolderTask: boolean;
	taskParentId?: string;
	taskChildIds: Array<string>;
};

type VisibleEndpoint = { nodeId: string; compressedLabel: string };

function getPathSegments(path: string): Array<string> {
	return path.split('/').filter(Boolean);
}

function isFolderTask(task: BaseTask): boolean {
	const { name, local, remote } = task;
	if (name === 'createLocalDir' || name === 'createRemoteDir') return true;
	if (name === 'removeLocal') return local?.isDir === true;
	if (name === 'removeRemote') return remote?.isDir === true;
	if (name === 'moveLocal') return remote?.isDir === true;
	if (name === 'moveRemote') return local?.isDir === true;
	return false;
}

function setTask(node: InternalNode, task: BaseTask) {
	node.task = task;
	node.isFolderTask = isFolderTask(task);
	node.isCreateFolderTask =
		node.isFolderTask && task.name !== 'removeLocal' && task.name !== 'removeRemote';
	node.isDeleteFolderTask =
		node.isFolderTask && (task.name === 'removeLocal' || task.name === 'removeRemote');
}

function createNode(name: string, task?: BaseTask): InternalNode {
	const node: InternalNode = {
		childIds: [],
		isCreateFolderTask: false,
		isDeleteFolderTask: false,
		isFolderTask: false,
		name,
		taskChildIds: [],
	};
	if (task) setTask(node, task);
	return node;
}

function resolveVisibleEndpoint(
	nodes: Record<string, InternalNode>,
	startNodeId: string,
): VisibleEndpoint {
	let currentId = startNodeId;
	let current = nodes[currentId];
	const labelSegments = [current.name];
	while (current.task === undefined && current.childIds.length === 1) {
		currentId = current.childIds[0];
		current = nodes[currentId];
		labelSegments.push(current.name);
	}
	return { compressedLabel: labelSegments.join(' / '), nodeId: currentId };
}

function isFolderVisibleNode(node: InternalNode): boolean {
	return node.task === undefined || node.isFolderTask;
}

function getVisibleChildren(
	nodes: Record<string, InternalNode>,
	nodeId: string,
): Array<VisibleEndpoint> {
	const visibleChildren = nodes[nodeId].childIds.map((childId) =>
		resolveVisibleEndpoint(nodes, childId),
	);
	visibleChildren.sort((left, right) => {
		const leftNode = nodes[left.nodeId];
		const rightNode = nodes[right.nodeId];
		const leftIsFolder = isFolderVisibleNode(leftNode);
		const rightIsFolder = isFolderVisibleNode(rightNode);
		if (leftIsFolder !== rightIsFolder) return leftIsFolder ? -1 : 1;
		return left.compressedLabel.localeCompare(right.compressedLabel);
	});
	return visibleChildren;
}

function annotateTaskTree(
	nodes: Record<string, InternalNode>,
	nodeId: string,
	taskAncestorId?: string,
) {
	const node = nodes[nodeId];
	if (node.task) node.taskParentId = taskAncestorId;
	const nextTaskAncestorId = node.task ? nodeId : taskAncestorId;
	const taskChildIds: Array<string> = [];
	for (const childId of node.childIds) {
		const child = nodes[childId];
		annotateTaskTree(nodes, childId, nextTaskAncestorId);
		if (child.task) taskChildIds.push(childId);
		else taskChildIds.push(...child.taskChildIds);
	}
	node.taskChildIds = taskChildIds;
}

function buildVisibleTree({
	nodes,
	nodeId,
	visibleEndpoint,
	orderedNodeIds,
	visibleDepth,
	visibleNodes,
}: {
	nodes: Record<string, InternalNode>;
	nodeId: string;
	visibleEndpoint: VisibleEndpoint;
	orderedNodeIds: Array<string>;
	visibleDepth: number;
	visibleNodes: Record<string, FileTreeNode>;
}) {
	const node = nodes[nodeId];
	const visibleChildren = getVisibleChildren(nodes, nodeId);
	visibleNodes[nodeId] = {
		childIds: visibleChildren.map((child) => child.nodeId),
		compressedLabel: visibleEndpoint.compressedLabel,
		depth: visibleDepth,
		isCreateFolderTask: node.isCreateFolderTask,
		isDeleteFolderTask: node.isDeleteFolderTask,
		task: node.task,
		taskChildIds: node.taskChildIds,
		taskParentId: node.taskParentId,
	};
	orderedNodeIds.push(nodeId);

	for (const child of visibleChildren)
		buildVisibleTree({
			nodeId: child.nodeId,
			nodes,
			orderedNodeIds,
			visibleDepth: visibleDepth + 1,
			visibleEndpoint: child,
			visibleNodes,
		});
}

export default function createFileTreeData(tasks: Array<BaseTask>): FileTreeData {
	const nodes: Record<string, InternalNode> = { [ROOT_NODE_ID]: createNode('') };
	const taskNodeIds: Array<string> = [];
	const taskNodeIdSet = new Set<string>();

	for (const task of tasks) {
		const segments = getPathSegments(task.key);
		let parentId = ROOT_NODE_ID;
		let currentPath = '';
		let leafNodeId = task.key;
		for (const [index, segment] of segments.entries()) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			const nodeId = currentPath;
			const isLeaf = index === segments.length - 1;
			if (isLeaf) leafNodeId = nodeId;
			const existing = nodes[nodeId];
			if (!existing) {
				nodes[nodeId] = createNode(segment, isLeaf ? task : undefined);
				nodes[parentId].childIds.push(nodeId);
			} else if (isLeaf) setTask(existing, task);

			parentId = nodeId;
		}
		if (!taskNodeIdSet.has(leafNodeId)) {
			taskNodeIdSet.add(leafNodeId);
			taskNodeIds.push(leafNodeId);
		}
	}

	annotateTaskTree(nodes, ROOT_NODE_ID);

	const orderedNodeIds: Array<string> = [];
	const visibleNodes: Record<string, FileTreeNode> = {};
	for (const child of getVisibleChildren(nodes, ROOT_NODE_ID))
		buildVisibleTree({
			nodeId: child.nodeId,
			nodes,
			orderedNodeIds,
			visibleDepth: 0,
			visibleEndpoint: child,
			visibleNodes,
		});

	return { nodes: visibleNodes, orderedNodeIds, taskNodeIds };
}
