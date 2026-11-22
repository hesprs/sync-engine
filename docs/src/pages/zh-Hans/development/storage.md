# 存储

Sync Engine 在 `Context` 上提供两个数据库访问点：一个异步的 IndexedDB 数据库和一个同步的内存数据库。两者都由 Uni-KV 支持。

## 数据库

```ts
// Async IndexedDB database
ctx.indexedDB: DatabaseAsync<General, General>;

// Synchronous in-memory database
ctx.memoryDB: DatabaseSync<General, General>;
```

现有的 store 包括 `localContext20000`、`remoteContext10000`、`remoteContext20000`（都存储 `Stat` 值）。Context 包装器内部用它们做状态缓存。

## Uni-KV API

SDK 转发了 Uni-KV 的通用类型：

```ts
type StoreAsync<T>;        // asynchronous store
type StoreSync<T>;         // synchronous store
type DatabaseAsync<D, M>;  // async database of stores and metadata
type DatabaseSync<D, M>;   // sync database of stores and metadata
type StoreOperations<T>    // Store.batch() payload type
```

Store 暴露 `get`、`set`、`delete`、`clear`、`keys`、`values`、`entries` 和 `batch`。数据库暴露 `getStore`、`getStoreNames`、`deleteStore`、`clearStores`、`getMeta`、`setMeta` 和 `dispose`。

## `RecordStore`

```ts
type RecordStore = StoreAsync<RecordStat>;
```

持久化同步记录条目。`getRecordStore()` 选择当前的本地 / 远端文件系统命名空间。未设置后端时返回一个 `Error`。

```ts
const records = ctx.getRecordStore();

await records.set('note.md', { isDir: false, local: 'local-uid', remote: 'remote-uid' });

const record = await records.get('note.md');
```

### Context 记录存储方法

| 方法                | 用途                                   |
| ------------------- | -------------------------------------- |
| `getRecordStore`    | 获取当前或指定名称的 `RecordStore`。   |
| `deleteRecordStore` | 删除当前或指定名称的记录存储。         |
| `clearRecordStores` | 清空所有记录存储。                     |
| `recordStoreExists` | 测试当前或指定名称的记录存储是否存在。 |
