import { deleteMemoryDB, openIndexedDB, openMemoryDB } from 'uni-kv';
import type { General, MaybePromise, RecordStat } from '@/types';
import type { PluginManifest } from 'obsidian';
import type { DatabaseAsync, StoreAsync } from 'uni-kv';

export type IndexedDBSchema = Record<string, RecordStat>;
export type RecordStore = StoreAsync<RecordStat>;

export const SYNC_STATE_STORE_NAME = 'sync-state';

export default class Storage {
	private readonly memoryDB;
	private readonly indexedDB;
	readonly root;

	constructor(
		private readonly ctx: { getNamespace: () => string | Error; manifest: PluginManifest },
	) {
		const { id } = ctx.manifest;
		this.memoryDB = openMemoryDB<General, General>(id);
		this.indexedDB = openIndexedDB<IndexedDBSchema>(id);
		this.root = {
			clearRecordStores: this.clearRecordStores,
			deleteRecordStore: this.deleteRecordStore,
			getRecordStore: this.getRecordStore,
			indexedDB: this.indexedDB as DatabaseAsync<General, General>,
			memoryDB: this.memoryDB,
			recordStoreExists: this.recordStoreExists,
		};
	}

	private readonly getRecordStore = <N extends string | undefined>(
		namespace?: N,
	): N extends string ? RecordStore : RecordStore | undefined => {
		const ns = namespace ?? this.ctx.getNamespace();
		if (ns instanceof Error) return ns as never;
		return this.indexedDB.getStore(ns);
	};

	private readonly deleteRecordStore = (namespace?: string): MaybePromise<void> => {
		const ns = namespace ?? this.ctx.getNamespace();
		if (!(ns instanceof Error)) return this.indexedDB.deleteStore(ns);
	};

	private readonly clearRecordStores = () => this.indexedDB.clearStores();

	private readonly recordStoreExists = (namespace?: string): MaybePromise<boolean> => {
		const ns = namespace ?? this.ctx.getNamespace();
		if (ns instanceof Error) return false;
		return this.indexedDB.getStoreNames().then((names) => names.includes(ns));
	};

	readonly dispose = () => {
		deleteMemoryDB(this.ctx.manifest.id);
		void this.indexedDB.dispose();
	};
}
