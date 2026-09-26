# Storage

Sync Engine provides two database access points on `Context`: an async IndexedDB database and a synchronous in-memory database. Both are backed by Uni-KV.

## Databases

```ts
// Async IndexedDB database
ctx.indexedDB: DatabaseAsync<General, General>;

// Synchronous in-memory database
ctx.memoryDB: DatabaseSync<General, General>;
```

Existing stores include `localContext20000`, `remoteContext10000`, `remoteContext20000` (all storing `Stat` values). These are used internally by the Context wrapper for stat caching.

## Uni-KV API

SDK re-exports generic Uni-KV types:

```ts
type StoreAsync<T>;        // asynchronous store
type StoreSync<T>;         // synchronous store
type DatabaseAsync<D, M>;  // async database of stores and metadata
type DatabaseSync<D, M>;   // sync database of stores and metadata
type StoreOperations<T>    // Store.batch() payload type
```

Stores expose `get`, `set`, `delete`, `clear`, `keys`, `values`, `entries`, and `batch`. Databases expose `getStore`, `getStoreNames`, `deleteStore`, `clearStores`, `getMeta`, `setMeta`, and `dispose`.

## `RecordStore`

```ts
type RecordStore = StoreAsync<RecordStat>;
```

Persists synchronization record entries. `getRecordStore()` selects the current local/remote filesystem namespace. When no backend is set, it returns an `Error`.

```ts
const records = ctx.getRecordStore();

await records.set('note.md', {
  isDir: false,
  local: 'local-uid',
  remote: 'remote-uid',
});

const record = await records.get('note.md');
```

### Context Record Store Methods

| Method              | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `getRecordStore`    | Gets current or named `RecordStore`.                |
| `deleteRecordStore` | Deletes current or named record store.              |
| `clearRecordStores` | Clears every record store.                          |
| `recordStoreExists` | Tests whether current or named record store exists. |
