import type { DataAdapter } from 'obsidian';

export async function mkdirRecursive(adapter: DataAdapter, path: string): Promise<void> {
	let currentPath = '';
	for (const part of path.split('/')) {
		if (!part) continue;
		currentPath = currentPath ? `${currentPath}/${part}` : part;
		if (!(await adapter.exists(currentPath))) await adapter.mkdir(currentPath);
	}
}
