import type { Task } from '@/sync';

export type FileTreeNode = {
	depth: number;
	parentId?: string;
	compressedLabel: string;
	task?: Task;
	isFolderTask: boolean;
	taskParentId?: string;
	taskChildIds: Array<string>;
};

export type FileTreeData = {
	orderedNodeIds: Array<string>;
	nodes: Record<string, FileTreeNode>;
	taskNodeIds: Array<string>;
};
