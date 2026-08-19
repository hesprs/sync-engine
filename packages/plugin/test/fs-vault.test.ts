import type { ListedFiles } from 'obsidian';
import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import { App, TFile, TFolder } from 'obsidian';
import type { RootFs, VaultRequest } from '@/fs';
import type { MaybePromise } from '@/types';
import { createVaultRequest, VaultFs } from '@/fs';

const { stream, bytes, file } = testKit;
const textDecoder = new TextDecoder();

type VaultFixtureStat = {
	mtime: number;
	size?: number;
	type: 'file' | 'folder';
};

type VaultCalls = {
	appendBinary: Array<[string, string]>;
	exists: Array<string>;
	list: Array<string>;
	mkdir: Array<string>;
	readBinary: Array<string>;
	remove: Array<string>;
	rename: Array<[string, string]>;
	stat: Array<string>;
	trashLocal: Array<string>;
	trashSystem: Array<string>;
	writeBinary: Array<[string, string]>;
};

type VaultControl = {
	appendBinary: (path: string, data: ArrayBuffer) => MaybePromise<void>;
	exists: (path: string) => MaybePromise<boolean>;
	list: (path: string) => MaybePromise<{ files: Array<string>; folders: Array<string> }>;
	mkdir: (path: string) => MaybePromise<void>;
	readBinary: (path: string) => MaybePromise<ArrayBuffer>;
	remove: (path: string) => MaybePromise<void>;
	rename: (path: string, newPath: string) => MaybePromise<void>;
	stat: (path: string) => MaybePromise<VaultFixtureStat | undefined>;
	trashLocal: (path: string) => MaybePromise<void>;
	trashSystem: (path: string) => MaybePromise<boolean>;
	writeBinary: (path: string, data: ArrayBuffer) => MaybePromise<void>;
};

type VaultHarness = {
	calls: VaultCalls;
	control: VaultControl;
	fs: RootFs;
	request: VaultRequest;
};

type VaultHarnessOptions = {
	config?: { trashOption?: 'local' };
	control?: Partial<VaultControl>;
	list?: Record<string, ListedFiles>;
	stats?: Record<string, VaultFixtureStat | undefined>;
	// Obsidian's in-memory file tree, which never contains hidden entries
	tree?: Record<string, ListedFiles>;
	trashSystem?: Record<string, boolean>;
};

function createCachedTree(options: VaultHarnessOptions): Map<string, TFile | TFolder> {
	const cached = new Map<string, TFile | TFolder>();
	const toFile = (path: string) => {
		const stat = options.stats?.[path];
		return Object.assign(new TFile(), {
			path,
			stat: { ctime: 0, mtime: stat?.mtime ?? 0, size: stat?.size ?? 0 },
		});
	};
	for (const [path, { files, folders }] of Object.entries(options.tree ?? {})) {
		const children = files.map(toFile);
		for (const child of children) cached.set(child.path, child);
		cached.set(
			path,
			Object.assign(new TFolder(), {
				children: [
					...folders.map((child) => Object.assign(new TFolder(), { path: child })),
					...children,
				],
				path,
			}),
		);
	}
	return cached;
}

function createVaultControl(options: VaultHarnessOptions): VaultControl {
	return {
		appendBinary: () => {},
		exists: () => false,
		list: (path: string) => options.list?.[path] ?? { files: [], folders: [] },
		mkdir: () => {},
		readBinary: () => new ArrayBuffer(0),
		remove: () => {},
		rename: () => {},
		stat: (path: string) => options.stats?.[path],
		trashLocal: () => {},
		trashSystem: (path: string) => options.trashSystem?.[path] ?? true,
		writeBinary: () => {},
		...options.control,
	};
}

function createVaultStub(options: VaultHarnessOptions): VaultHarness {
	const calls: VaultCalls = {
		appendBinary: [],
		exists: [],
		list: [],
		mkdir: [],
		readBinary: [],
		remove: [],
		rename: [],
		stat: [],
		trashLocal: [],
		trashSystem: [],
		writeBinary: [],
	};
	const control = createVaultControl(options);
	const adapter = {
		appendBinary: (path: string, data: ArrayBuffer) => {
			calls.appendBinary.push([path, textDecoder.decode(data)]);
			return control.appendBinary(path, data);
		},
		exists: (path: string) => {
			calls.exists.push(path);
			return control.exists(path);
		},
		list: (path: string) => {
			calls.list.push(path);
			return control.list(path);
		},
		mkdir: (path: string) => {
			calls.mkdir.push(path);
			return control.mkdir(path);
		},
		readBinary: (path: string) => {
			calls.readBinary.push(path);
			return control.readBinary(path);
		},
		remove: (path: string) => {
			calls.remove.push(path);
			return control.remove(path);
		},
		rename: (path: string, newPath: string) => {
			calls.rename.push([path, newPath]);
			return control.rename(path, newPath);
		},
		stat: (path: string) => {
			calls.stat.push(path);
			return control.stat(path);
		},
		trashLocal: (path: string) => {
			calls.trashLocal.push(path);
			return control.trashLocal(path);
		},
		trashSystem: (path: string) => {
			calls.trashSystem.push(path);
			return control.trashSystem(path);
		},
		writeBinary: (path: string, data: ArrayBuffer) => {
			calls.writeBinary.push([path, textDecoder.decode(data)]);
			return control.writeBinary(path, data);
		},
	};

	const cached = createCachedTree(options);
	const app = {
		vault: {
			adapter,
			config: { ...options.config },
			getAbstractFileByPath: (path: string) => cached.get(path),
		},
		workspace: { layoutReady: true },
	} as unknown as App;
	const request = createVaultRequest(app);

	return {
		calls,
		control,
		fs: new VaultFs(request, 'Vault Name'),
		request,
	};
}

test('stat should normalize root, file, and folder keys', async () => {
	const vault = createVaultStub({
		stats: {
			folder: { mtime: 1, size: 0, type: 'folder' },
			'note.md': { mtime: 123, size: 9, type: 'file' },
		},
	});

	expect(await vault.fs.stat('/')).toEqual({ isDir: true, key: '/' });
	expect(await vault.fs.stat('note.md')).toEqual({
		isDir: false,
		key: 'note.md',
		mtime: 123,
		size: 9,
		uid: '123~9',
	});
	expect(await vault.fs.stat('folder/')).toEqual({ isDir: true, key: 'folder/' });
});

test('write should return refreshed file uid from stat', async () => {
	const vault = createVaultStub({
		stats: {
			'note.md': { mtime: 456, size: 5, type: 'file' },
		},
	});
	const data = bytes('hello');

	expect(await vault.fs.write('note.md', data, file('note.md'))).toBe('456~5');
	expect(vault.calls.writeBinary).toStrictEqual([['note.md', 'hello']]);
	expect(vault.calls.stat).toStrictEqual(['note.md']);
});

test('writeStream should append to temp file then rename into place', async () => {
	const vault = createVaultStub({
		stats: {
			'note.md': { mtime: 999, size: 6, type: 'file' },
		},
	});

	const uid = await vault.fs.writeStream('note.md', stream(['ab', 'cdef']), file('note.md'));

	expect(uid).toBe('999~6');
	expect(vault.calls.writeBinary).toStrictEqual([]);
	expect(vault.calls.appendBinary).toHaveLength(2);
	expect(vault.calls.appendBinary[0]?.[0]).toStartWith('.trash/');
	expect(vault.calls.appendBinary[0]?.[1]).toBe('ab');
	expect(vault.calls.appendBinary[1]?.[0]).toStartWith('.trash/');
	expect(vault.calls.appendBinary[1]?.[1]).toBe('cdef');
	expect(vault.calls.rename[0]).toBeDefined();
	expect(vault.calls.rename[0]?.[1]).toBe('note.md');
});

test('delete should follow Obsidian trash fallback policy', async () => {
	const localVault = createVaultStub({ config: { trashOption: 'local' } });
	await localVault.fs.delete('note.md');
	expect(localVault.calls.trashLocal).toStrictEqual(['note.md']);
	expect(localVault.calls.trashSystem).toStrictEqual([]);

	const systemVault = createVaultStub({ trashSystem: { 'note.md': true } });
	await systemVault.fs.delete('note.md');
	expect(systemVault.calls.trashSystem).toStrictEqual(['note.md']);
	expect(systemVault.calls.trashLocal).toStrictEqual([]);

	const fallbackVault = createVaultStub({ trashSystem: { 'note.md': false } });
	await fallbackVault.fs.delete('note.md');
	expect(fallbackVault.calls.trashSystem).toStrictEqual(['note.md']);
	expect(fallbackVault.calls.trashLocal).toStrictEqual(['note.md']);
});

test('list should DFS descendants and exclude queried root', async () => {
	const vault = createVaultStub({
		list: {
			'/': { files: ['root.md'], folders: ['folder'] },
			folder: { files: ['folder/child.md'], folders: ['folder/nested'] },
			'folder/nested': { files: ['folder/nested/deep.md'], folders: [] },
		},
		stats: {
			folder: { mtime: 1, size: 0, type: 'folder' },
			'folder/child.md': { mtime: 2, size: 2, type: 'file' },
			'folder/nested': { mtime: 3, size: 0, type: 'folder' },
			'folder/nested/deep.md': { mtime: 4, size: 4, type: 'file' },
			'root.md': { mtime: 1, size: 1, type: 'file' },
		},
	});

	const stats = await vault.fs.list('/', () => 'advance');
	const keys = stats.map(({ key }) => key);

	expect(keys.toSorted()).toStrictEqual([
		'folder/',
		'folder/child.md',
		'folder/nested/',
		'folder/nested/deep.md',
		'root.md',
	]);
	expect(stats.some(({ key }) => key === '/')).toBe(false);
});

// Hidden entries live on disk but never appear in Obsidian's in-memory file tree
const HIDDEN_OPTIONS: VaultHarnessOptions = {
	list: {
		'/': { files: ['root.md', '.hidden-root.md'], folders: ['folder'] },
		folder: { files: ['folder/note.md', 'folder/.hidden.md'], folders: ['folder/.hidden'] },
		'folder/.hidden': { files: ['folder/.hidden/inner.md'], folders: [] },
	},
	stats: {
		'.hidden-root.md': { mtime: 5, size: 5, type: 'file' },
		'folder/.hidden.md': { mtime: 2, size: 2, type: 'file' },
		'folder/.hidden/inner.md': { mtime: 3, size: 3, type: 'file' },
		'folder/note.md': { mtime: 4, size: 4, type: 'file' },
		'root.md': { mtime: 1, size: 1, type: 'file' },
	},
	tree: {
		'/': { files: ['root.md'], folders: ['folder'] },
		folder: { files: ['folder/note.md'], folders: [] },
	},
};

const HIDDEN_KEYS = [
	'.hidden-root.md',
	'folder/',
	'folder/.hidden.md',
	'folder/.hidden/',
	'folder/.hidden/inner.md',
	'folder/note.md',
	'root.md',
].toSorted();

async function listedKeys(vault: VaultHarness): Promise<Array<string>> {
	const stats = await vault.fs.list('/', () => 'advance');
	return stats.map(({ key }) => key).toSorted();
}

test('list should report hidden entries the file tree omits', async () => {
	const vault = createVaultStub(HIDDEN_OPTIONS);

	expect(await listedKeys(vault)).toStrictEqual(HIDDEN_KEYS);
	expect(vault.calls.list.toSorted()).toStrictEqual(['/', 'folder', 'folder/.hidden']);
});

test('LIST should keep using the file tree when the caller does not opt out', async () => {
	const vault = createVaultStub(HIDDEN_OPTIONS);

	expect(await vault.request({ key: 'folder/', method: 'LIST' })).toStrictEqual({
		files: ['folder/note.md'],
		folders: [],
	});
	expect(vault.calls.list).toStrictEqual([]);
});
