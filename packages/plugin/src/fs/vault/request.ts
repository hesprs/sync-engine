import type { Vault, Stat, ListedFiles, App } from 'obsidian';
import { toArrayBuffer, toUint8Array } from '@repo/shared/binary';
import { isFolder, stripEndSlash } from '@repo/shared/path';
import { TFile, TFolder } from 'obsidian';
import type { Binary } from '@/types';

type VaultRequestParam =
	| { method: 'GET'; key: string }
	| { method: 'GET_STREAM'; key: string }
	| { method: 'PUT'; key: string; value: Binary; headers?: { mtime?: number; ctime?: number } }
	| { method: 'APPEND'; key: string; value: Binary; headers?: { mtime?: number; ctime?: number } }
	| { method: 'DELETE'; key: string; headers?: { permanent?: boolean } }
	| { method: 'MOVE'; key: string; headers: { destination: string } }
	| { method: 'MKDIR'; key: string }
	| { method: 'EXISTS'; key: string }
	| { method: 'STAT'; key: string; headers?: { cached?: boolean } }
	| { method: 'LIST'; key: string; headers?: { cached?: boolean } };

type VaultRequestResponseMap = {
	GET: Binary;
	GET_STREAM: ReadableStream<Binary>;
	PUT: void;
	APPEND: void;
	DELETE: void;
	MOVE: void;
	MKDIR: void;
	EXISTS: boolean;
	STAT: Stat;
	LIST: ListedFiles;
};

export type VaultRequest = <T extends VaultRequestParam>(
	params: T,
) => Promise<VaultRequestResponseMap[T['method']]>;

function toVaultPath(key: string) {
	if (key === '/') return key;
	return stripEndSlash(key);
}

function toKey(vaultPath: string, isDir: boolean): string {
	if (vaultPath === '/') return '/';
	return isDir ? `${vaultPath}/` : vaultPath;
}

function getTrashOption(vault: Vault): 'local' | 'system' | undefined {
	const configuredVault = vault as { config?: { trashOption?: 'local' | 'system' } };
	return configuredVault.config?.trashOption;
}

export default function createVaultRequest(app: App): VaultRequest {
	const { vault, workspace } = app;
	const { adapter } = vault;

	// Prevents vault scanning while Obsidian is indexing the vault
	const canUseCache = () => workspace.layoutReady;

	return async <T extends VaultRequestParam>(
		params: T,
	): Promise<VaultRequestResponseMap[T['method']]> => {
		const { method, key } = params;
		const path = toVaultPath(key);

		if (method === 'GET')
			return adapter.readBinary(path).then((buffer) => toUint8Array(buffer)) as never;
		if (method === 'GET_STREAM') {
			const response = await fetch(adapter.getResourcePath(path));
			if (!response.body) throw new Error('Streaming vault file is not supported!');
			return response.body as never;
		}
		if (method === 'PUT')
			return adapter.writeBinary(path, toArrayBuffer(params.value), params.headers) as never;
		if (method === 'APPEND')
			return adapter.appendBinary(path, toArrayBuffer(params.value), params.headers) as never;
		if (method === 'DELETE') {
			if (params.headers?.permanent) return adapter.remove(path) as never;
			if (getTrashOption(vault) === 'local' || !(await adapter.trashSystem(path)))
				await adapter.trashLocal(path);
			return undefined as never;
		}
		if (method === 'MOVE')
			return adapter.rename(path, toVaultPath(params.headers.destination)) as never;
		if (method === 'MKDIR') return (key === '/' ? undefined : adapter.mkdir(path)) as never;
		if (method === 'EXISTS') {
			if (vault.getAbstractFileByPath(path)) return true as never;
			return adapter.exists(path, true) as never;
		}
		if (method === 'STAT') {
			if (isFolder(key)) return { ctime: 0, mtime: 0, size: 0, type: 'folder' } as never;
			if (canUseCache() && (params.headers?.cached ?? true)) {
				const file = vault.getAbstractFileByPath(path);
				if (file instanceof TFile) return { ...file.stat, type: 'file' } as never;
				else if (file instanceof TFolder)
					return { ctime: 0, mtime: 0, size: 0, type: 'folder' } as never;
			}
			const raw = await adapter.stat(path);
			if (!raw) throw new Error(`Stat of "${path}" not found!`);
			return raw as never;
		}
		if (method === 'LIST') {
			const children: ListedFiles = { files: [], folders: [] };
			if (canUseCache() && (params.headers?.cached ?? true)) {
				const folder = vault.getAbstractFileByPath(path);
				if (folder instanceof TFolder) {
					folder.children.forEach((child) =>
						child instanceof TFolder
							? children.folders.push(toKey(child.path, true))
							: children.files.push(child.path),
					);
					return children as never;
				}
			}
			const { files, folders } = await adapter.list(path);
			children.files.push(...files);
			children.folders.push(...folders.map((folder) => toKey(folder, true)));
			return children as never;
		}
		return undefined as never;
	};
}
