import type { DatabaseAsync, StoreAsync } from 'uni-kv';
import { deleteMemoryDB, openIndexedDB, openMemoryDB } from 'uni-kv';
import type { General, MaybePromise, RecordStat } from '@/types';

export type IndexedDBSchema = Record<string, RecordStat>;
export type RecordStore = StoreAsync<RecordStat>;

export const SYNC_STATE_STORE_NAME = 'sync-state';
export const STORAGE_NAME = 'sync-engine';

export default class Storage {
	private readonly memoryDB = openMemoryDB<General, General>(STORAGE_NAME);
	private readonly indexedDB = openIndexedDB<IndexedDBSchema>(STORAGE_NAME);

	constructor(private readonly ctx: { getNamespace: () => string | Error }) {}

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

	readonly root = {
		clearRecordStores: this.clearRecordStores,
		deleteRecordStore: this.deleteRecordStore,
		getRecordStore: this.getRecordStore,
		indexedDB: this.indexedDB as DatabaseAsync<General, General>,
		memoryDB: this.memoryDB,
		recordStoreExists: this.recordStoreExists,
	};

	readonly dispose = () => {
		deleteMemoryDB(STORAGE_NAME);
		void this.indexedDB.dispose();
	};
}
