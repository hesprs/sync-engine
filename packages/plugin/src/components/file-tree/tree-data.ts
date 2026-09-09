import type { BaseTask } from '@/sync';
import type { FileTreeData, FileTreeNode } from './types';

const ROOT_NODE_ID = '__root__';

type InternalNode = {
	id: string;
	name: string;
	path: string;
	childIds: Array<string>;
	task?: BaseTask;
	isFolderTask: boolean;
	isCreateFolderTask: boolean;
	isDeleteFolderTask: boolean;
	selectableDescendantTaskIds: Array<string>;
	ancestorCreateFolderTaskIds: Array<string>;
	ancestorDeleteFolderTaskIds: Array<string>;
};

type VisibleEndpoint = {
	nodeId: string;
	compressedLabel: string;
};

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

function isCreateFolderTask(task: BaseTask): boolean {
	const { name, local, remote } = task;
	return (
		name === 'createLocalDir' ||
		name === 'createRemoteDir' ||
		(name === 'moveLocal' && remote?.isDir === true) ||
		(name === 'moveRemote' && local?.isDir === true)
	);
}

function isDeleteFolderTask(task: BaseTask): boolean {
	const { name, local, remote } = task;
	return (
		(name === 'removeLocal' && local?.isDir === true) ||
		(name === 'removeRemote' && remote?.isDir === true)
	);
}

function createNode(input: {
	id: string;
	name: string;
	path: string;
	task?: BaseTask;
}): InternalNode {
	const task = input.task;
	return {
		ancestorCreateFolderTaskIds: [],
		ancestorDeleteFolderTaskIds: [],
		childIds: [],
		id: input.id,
		isCreateFolderTask: task ? isCreateFolderTask(task) : false,
		isDeleteFolderTask: task ? isDeleteFolderTask(task) : false,
		isFolderTask: task ? isFolderTask(task) : false,
		name: input.name,
		path: input.path,
		selectableDescendantTaskIds: [],
		task,
	};
}

function applyTaskToNode(node: InternalNode, task: BaseTask) {
	node.task = task;
	node.isFolderTask = isFolderTask(task);
	node.isCreateFolderTask = isCreateFolderTask(task);
	node.isDeleteFolderTask = isDeleteFolderTask(task);
}

function resolveVisibleEndpoint(
	nodes: Record<string, InternalNode>,
	startNodeId: string,
): VisibleEndpoint {
	let current = nodes[startNodeId];
	const labelSegments = [current.name];
	while (current.task === undefined && current.childIds.length === 1) {
		const child = nodes[current.childIds[0]];
		labelSegments.push(child.name);
		current = child;
	}
	return {
		compressedLabel: labelSegments.join(' / '),
		nodeId: current.id,
	};
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

function collectSelectableDescendantTaskIds(
	nodes: Record<string, InternalNode>,
	nodeId: string,
): Array<string> {
	const node = nodes[nodeId];
	const descendantIds: Array<string> = [];
	for (const childId of node.childIds) {
		const child = nodes[childId];
		if (child.task) descendantIds.push(child.id);
		descendantIds.push(...collectSelectableDescendantTaskIds(nodes, childId));
	}
	node.selectableDescendantTaskIds = descendantIds;
	return descendantIds;
}

function annotateAncestors({
	nodes,
	nodeId,
	ancestorCreateFolderTaskIds,
	ancestorDeleteFolderTaskIds,
}: {
	nodes: Record<string, InternalNode>;
	nodeId: string;
	ancestorCreateFolderTaskIds: Array<string>;
	ancestorDeleteFolderTaskIds: Array<string>;
}) {
	const node = nodes[nodeId];
	node.ancestorCreateFolderTaskIds = ancestorCreateFolderTaskIds;
	node.ancestorDeleteFolderTaskIds = ancestorDeleteFolderTaskIds;
	const nextCreateIds = node.isCreateFolderTask
		? [...ancestorCreateFolderTaskIds, node.id]
		: ancestorCreateFolderTaskIds;
	const nextDeleteIds = node.isDeleteFolderTask
		? [...ancestorDeleteFolderTaskIds, node.id]
		: ancestorDeleteFolderTaskIds;

	for (const childId of node.childIds)
		annotateAncestors({
			ancestorCreateFolderTaskIds: nextCreateIds,
			ancestorDeleteFolderTaskIds: nextDeleteIds,
			nodeId: childId,
			nodes,
		});
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
		ancestorCreateFolderTaskIds: node.ancestorCreateFolderTaskIds,
		ancestorDeleteFolderTaskIds: node.ancestorDeleteFolderTaskIds,
		childIds: visibleChildren.map((child) => child.nodeId),
		compressedLabel: visibleEndpoint.compressedLabel,
		depth: visibleDepth,
		id: node.id,
		isCreateFolderTask: node.isCreateFolderTask,
		isDeleteFolderTask: node.isDeleteFolderTask,
		isFolderTask: node.isFolderTask,
		path: node.path,
		selectableDescendantTaskIds: node.selectableDescendantTaskIds,
		task: node.task,
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
	const nodes: Record<string, InternalNode> = {
		[ROOT_NODE_ID]: createNode({ id: ROOT_NODE_ID, name: '', path: '' }),
	};
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
				nodes[nodeId] = createNode({
					id: nodeId,
					name: segment,
					path: currentPath,
					task: isLeaf ? task : undefined,
				});
				nodes[parentId].childIds.push(nodeId);
			} else if (isLeaf) applyTaskToNode(existing, task);

			parentId = nodeId;
		}
		if (!taskNodeIdSet.has(leafNodeId)) {
			taskNodeIdSet.add(leafNodeId);
			taskNodeIds.push(leafNodeId);
		}
	}

	collectSelectableDescendantTaskIds(nodes, ROOT_NODE_ID);
	annotateAncestors({
		ancestorCreateFolderTaskIds: [],
		ancestorDeleteFolderTaskIds: [],
		nodeId: ROOT_NODE_ID,
		nodes,
	});

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

	return {
		nodes: visibleNodes,
		orderedNodeIds,
		taskNodeIds,
	};
}
