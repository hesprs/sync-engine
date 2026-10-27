import type { Task } from '@/sync';

export type FileTreeNode = {
	depth: number;
	childIds: Array<string>;
	compressedLabel: string;
	task?: Task;
	taskParentId?: string;
	taskChildIds: Array<string>;
	isCreateFolderTask: boolean;
	isDeleteFolderTask: boolean;
};

export type FileTreeData = {
	orderedNodeIds: Array<string>;
	nodes: Record<string, FileTreeNode>;
	taskNodeIds: Array<string>;
};
