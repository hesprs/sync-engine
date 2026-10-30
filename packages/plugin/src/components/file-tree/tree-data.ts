import { isFolder } from '@repo/shared/path';
import type { FileTreeData, FileTreeNode } from './types';
import type { Task } from '@/sync';

const ROOT_NODE_ID = '__root__';

type InternalNode = { name: string; childIds: Array<string>; task?: Task };

type VisibleEndpoint = { nodeId: string; compressedLabel: string };

function isFolderTask({ name, local, remote, key }: Task): boolean {
	if (name === 'createLocalDir' || name === 'createRemoteDir') return true;
	if (name === 'removeLocal') return local.isDir;
	if (name === 'removeRemote') return remote.isDir;
	if (name === 'moveLocal' || name === 'moveRemote') return isFolder(key);
	return false;
}

function isFolderNode(node: InternalNode): boolean {
	return node.task === undefined || isFolderTask(node.task);
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

function getVisibleChildren(
	nodes: Record<string, InternalNode>,
	nodeId: string,
): Array<VisibleEndpoint> {
	const visibleChildren = nodes[nodeId].childIds.map((childId) =>
		resolveVisibleEndpoint(nodes, childId),
	);
	visibleChildren.sort((left, right) => {
		const leftIsFolder = isFolderNode(nodes[left.nodeId]);
		const rightIsFolder = isFolderNode(nodes[right.nodeId]);
		if (leftIsFolder !== rightIsFolder) return leftIsFolder ? -1 : 1;
		return left.compressedLabel.localeCompare(right.compressedLabel);
	});
	return visibleChildren;
}

function buildVisibleTree({
	nodes,
	orderedNodeIds,
	parentId,
	visibleDepth,
	visibleEndpoint,
	visibleNodes,
}: {
	nodes: Record<string, InternalNode>;
	orderedNodeIds: Array<string>;
	parentId?: string;
	visibleDepth: number;
	visibleEndpoint: VisibleEndpoint;
	visibleNodes: Record<string, FileTreeNode>;
}) {
	const { compressedLabel, nodeId } = visibleEndpoint;
	visibleNodes[nodeId] = {
		compressedLabel,
		depth: visibleDepth,
		isFolderTask: isFolderNode(nodes[nodeId]),
		parentId,
		task: nodes[nodeId].task,
		taskChildIds: [],
	};
	orderedNodeIds.push(nodeId);
	for (const child of getVisibleChildren(nodes, nodeId))
		buildVisibleTree({
			nodes,
			orderedNodeIds,
			parentId: nodeId,
			visibleDepth: visibleDepth + 1,
			visibleEndpoint: child,
			visibleNodes,
		});
}

export default function createFileTreeData(tasks: Array<Task>): FileTreeData {
	const nodes: Record<string, InternalNode> = { [ROOT_NODE_ID]: { childIds: [], name: '' } };
	const taskNodeIds: Array<string> = [];
	const taskNodeIdSet = new Set<string>();

	for (const task of tasks) {
		const segments = task.key.split('/').filter(Boolean);
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
				nodes[nodeId] = { childIds: [], name: segment, task: isLeaf ? task : undefined };
				nodes[parentId].childIds.push(nodeId);
			} else if (isLeaf) existing.task = task;

			parentId = nodeId;
		}
		if (!taskNodeIdSet.has(leafNodeId)) {
			taskNodeIdSet.add(leafNodeId);
			taskNodeIds.push(leafNodeId);
		}
	}

	const orderedNodeIds: Array<string> = [];
	const visibleNodes: Record<string, FileTreeNode> = {};
	for (const child of getVisibleChildren(nodes, ROOT_NODE_ID))
		buildVisibleTree({
			nodes,
			orderedNodeIds,
			visibleDepth: 0,
			visibleEndpoint: child,
			visibleNodes,
		});

	// Preorder: a node's visible parent is always resolved before itself.
	for (const nodeId of orderedNodeIds) {
		const node = visibleNodes[nodeId];
		if (node.parentId === undefined) continue;
		const parent = visibleNodes[node.parentId];
		const taskParentId = parent.task === undefined ? parent.taskParentId : node.parentId;
		if (taskParentId === undefined) continue;
		node.taskParentId = taskParentId;
		if (node.task) {
			let ancestorId: string | undefined = taskParentId;
			while (ancestorId !== undefined) {
				visibleNodes[ancestorId].taskChildIds.push(nodeId);
				ancestorId = visibleNodes[ancestorId].taskParentId;
			}
		}
	}

	return { nodes: visibleNodes, orderedNodeIds, taskNodeIds };
}
