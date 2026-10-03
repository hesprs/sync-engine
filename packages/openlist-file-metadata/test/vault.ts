import type { Binary, RootFs, VaultRequest } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import MetadataLocalFs, { LocalSession, localMiddleware } from '../src/local';

type Entry = { value: Binary; ctime: number; mtime: number };

export default async function createVault(enabled = () => true) {
	// Exercise the production VaultFs without importing its internal TS aliases
	// Into this module's compilation unit.
	const source = new URL('../../plugin/src/fs/vault/index.ts', import.meta.url).href;
	const { default: VaultFs } = (await import(source)) as {
		default: new (request: VaultRequest, name: string) => RootFs;
	};
	const files = new Map<string, Entry>();
	const folders = new Set<string>();
	const calls: Array<{ key: string; params: Parameters<VaultRequest>[1] }> = [];
	let failAppend = false;
	const request: VaultRequest = async (key, params) => {
		await testKit.flush(1);
		calls.push({ key, params });
		const current = files.get(key);
		if (!params || params.method === 'GET') return current?.value as never;
		if (params.method === 'GET_STREAM')
			return testKit.stream([current?.value ?? new Uint8Array()]) as never;
		if (params.method === 'STAT') {
			if (!current) throw new Error(`Missing: ${key}`);
			return {
				ctime: current.ctime,
				mtime: current.mtime,
				size: current.value.length,
				type: 'file',
			} as never;
		}
		if (params.method === 'PUT' || params.method === 'APPEND') {
			if (params.method === 'APPEND' && failAppend) throw new Error('append failed');
			const oldValue =
				params.method === 'APPEND'
					? (current?.value ?? new Uint8Array())
					: new Uint8Array();
			files.set(key, {
				ctime: params.ctime ?? current?.ctime ?? Date.now(),
				mtime: params.mtime ?? Date.now(),
				value: new Uint8Array([...oldValue, ...params.value]),
			});
		}
		if (params.method === 'EXISTS') return (files.has(key) || folders.has(key)) as never;
		if (params.method === 'MKDIR') folders.add(key);
		if (params.method === 'DELETE') files.delete(key);
		if (params.method === 'MOVE') {
			if (!current) throw new Error(`Missing: ${key}`);
			files.set(params.destination, current);
			files.delete(key);
		}
		if (params.method === 'LIST') return { files: [...files.keys()], folders: [] } as never;
		return undefined as never;
	};
	const session = new LocalSession(enabled);
	const fs = new MetadataLocalFs(
		new VaultFs(localMiddleware(request, session), 'fixture'),
		session,
	);
	return {
		calls,
		fail: () => {
			failAppend = true;
		},
		files,
		fs,
		session,
	};
}
