import type { Vault, Stat, ListedFiles, App } from 'obsidian';
import { toArrayBuffer, toUint8Array } from '@repo/shared/binary';
import { requestNative } from '@repo/shared/e2e-utils.spec';
import { basename, isFolder, stripEndSlash } from '@repo/shared/path';
import createRangeReadStream from '@repo/shared/read-stream';
import { TFile, TFolder } from 'obsidian';
import type { Binary, MaybePromise } from '@/types';
import { OS } from '@/modules/EventBus';
import { chunkSize, concurrency } from '@/utils/pipe';

type VaultRequestParam =
	| { method: 'GET'; key: string }
	| { method: 'GET_STREAM'; key: string; size: number }
	| { method: 'PUT'; key: string; value: Binary; mtime?: number; ctime?: number }
	| { method: 'APPEND'; key: string; value: Binary; mtime?: number; ctime?: number }
	| { method: 'DELETE'; key: string; trash?: TrashOption }
	| { method: 'MOVE'; key: string; destination: string }
	| { method: 'MKDIR'; key: string }
	| { method: 'EXISTS'; key: string }
	| { method: 'STAT'; key: string; cached?: boolean }
	| { method: 'LIST'; key: string; cached?: boolean };

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

// Capacitor ranged local file request only supports those extensions
// Fixed in Capacitor 7: https://github.com/ionic-team/capacitor/pull/7868
// But Obsidian is still using 5
// TODO: remove once Obsidian adopts Capacitor 7
const CAPACITOR_MEDIA_EXTENSIONS = [
	'm4v',
	'mov',
	'mp4',
	'aac',
	'ac3',
	'aiff',
	'au',
	'flac',
	'm4a',
	'mp3',
	'wav',
];
const isMediaExtension = (key: string) =>
	CAPACITOR_MEDIA_EXTENSIONS.some((ext) => key.endsWith(`.${ext}`));

function toVaultPath(key: string) {
	if (key === '/') return key;
	return stripEndSlash(key);
}

function toKey(vaultPath: string, isDir: boolean): string {
	if (vaultPath === '/') return '/';
	return isDir ? `${vaultPath}/` : vaultPath;
}

// Obsidian trashOption mapping:
// "none": permanent
// "system" / undefined: system
// "local": local
type TrashOption = 'local' | 'system' | 'permanent';
function getTrashOption(vault: Vault): TrashOption {
	const option = vault.config.trashOption;
	return option ? (option === 'none' ? 'permanent' : option) : 'system';
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
			const url = adapter.getResourcePath(path);
			// Local file fetch streaming isn't supported in iOS
			if (OS.iOS || (OS.iPadOS && isMediaExtension(key)))
				return createRangeReadStream({
					chunkSize,
					concurrency,
					requestRange: async (start, end) =>
						(
							await requestNative(url, {
								headers: { Range: `bytes=${start}-${end}` },
								method: 'GET',
							})
						).bytes(),
					size: params.size,
				}) as never;
			const response = await requestNative(url);
			if (!response.body) throw new Error('Streaming vault file is not supported!');
			return response.body as never;
		}
		if (method === 'PUT')
			return withCheckChars(key, () =>
				adapter.writeBinary(path, toArrayBuffer(params.value), params),
			) as never;
		if (method === 'APPEND')
			return withCheckChars(key, () =>
				adapter.appendBinary(path, toArrayBuffer(params.value), params),
			) as never;
		if (method === 'DELETE') {
			const { trash = getTrashOption(vault) } = params;
			if (trash === 'permanent') return adapter.remove(path) as never;
			if (trash === 'local' || !(await adapter.trashSystem(path)))
				await adapter.trashLocal(path);
			return undefined as never;
		}
		if (method === 'MOVE')
			return adapter.rename(path, toVaultPath(params.destination)) as never;
		if (method === 'MKDIR')
			return (
				key === '/' ? undefined : withCheckChars(key, () => adapter.mkdir(path))
			) as never;
		if (method === 'EXISTS') {
			if (vault.getAbstractFileByPath(path)) return true as never;
			return adapter.exists(path, true) as never;
		}
		if (method === 'STAT') {
			if (isFolder(key)) return { ctime: 0, mtime: 0, size: 0, type: 'folder' } as never;
			if (canUseCache() && (params.cached ?? true)) {
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
			if (canUseCache() && (params.cached ?? true)) {
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

async function withCheckChars<T>(key: string, action: () => MaybePromise<T>): Promise<T> {
	try {
		return await action();
	} catch (error: unknown) {
		if (OS.Windows) {
			const match = /[<>:"/\\|?*]/u.exec(basename(key));
			if (match)
				throw new Error(`Windows forbids character "${match[0]}" in file names!`, {
					cause: error,
				});
		}
		throw error;
	}
}
