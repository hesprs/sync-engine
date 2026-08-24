import { App, ListedFiles, RequestUrlParam, Stat } from "obsidian";
//#region ../shared/src/e2e-utils.spec.d.ts
type General = any;
//#endregion
//#region ../shared/src/binary.d.ts
type Binary = Uint8Array<ArrayBuffer>;
//#endregion
//#region src/types.d.ts
type MaybePromise<T> = Promise<T> | T;
type TogglableValue<T = number> = {
  enabled: boolean;
  value: T;
};
type FileStat = {
  isDir: false;
  key: string;
  mtime: number;
  size: number;
  uid: string;
};
type FolderStat = {
  isDir: true;
  key: string;
};
type Stat$1 = FileStat | FolderStat;
type RecordStat = {
  isDir: false;
  local: string;
  remote: string;
} | {
  isDir: true;
};
type StatsMap = Map<string, Stat$1>;
type RecordStatsMap = Map<string, RecordStat>;
type GlobMatchRule = {
  expr: string;
  caseSensitive: boolean;
};
type Progress<T = string> = {
  total: number;
  completed: number;
  current?: T;
};
//#endregion
//#region src/fs/interface.d.ts
/**
 * All keys use unified format:
 * - root: `/`
 * - file: `note.md`, `folder/note.md`
 * - folder: `folder/`, `folder/nested/`
 */
type RootFs = {
  getUid(): string;
  read(key: string, stat: FileStat): MaybePromise<Binary>;
  readStream(key: string, stat: FileStat): MaybePromise<ReadableStream<Binary>>;
  write(key: string, value: Binary, stat: FileStat): MaybePromise<string>;
  writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat): MaybePromise<string>;
  delete(key: string): MaybePromise<void>;
  move(oldKey: string, newKey: string): MaybePromise<void>;
  mkdir(key: string, recursive?: boolean): MaybePromise<void>;
  stat(key: string): MaybePromise<Stat$1>;
  exists(key: string): MaybePromise<boolean>;
  list(key: string, reporter: ListReporter): MaybePromise<Array<Stat$1>>;
};
type ListReporter = (progress: Required<Progress>) => MaybePromise<'include' | 'exclude' | 'advance'>;
type WrappedFs = RootFs & {
  original: Fs;
};
type Fs = WrappedFs | RootFs;
type WriteAtom = {
  type: 'write';
  key: string;
  execute: () => MaybePromise<string>;
  resolve: (uid: string) => void;
  reject: (err: Error) => void;
};
type DeleteAtom = {
  type: 'delete';
  key: string;
  execute: () => MaybePromise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
};
type MoveAtom = {
  type: 'move';
  oldKey: string;
  newKey: string;
  execute: () => MaybePromise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
};
type MkdirAtom = {
  type: 'mkdir';
  key: string;
  execute: () => MaybePromise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
};
type InputAtom = WriteAtom | DeleteAtom | MoveAtom | MkdirAtom;
type CustomAtom = {
  type: 'custom';
  execute: () => MaybePromise<void>;
};
type OutputAtom = InputAtom | CustomAtom;
type OptimizerInput = {
  atoms: Array<InputAtom>;
  fs: Fs;
  executeAtom: (atom: OutputAtom) => Promise<void | string>;
};
type OptimizerOutput = Array<OutputAtom>;
type BatchOptimizer = (input: OptimizerInput) => OptimizerOutput;
//#endregion
//#region ../../node_modules/.bun/uni-kv@..+..+uni-kv.tgz/node_modules/uni-kv/dist/interface.d.ts
//#region src/interface.d.ts
type Database<D extends Record<string, unknown>, M extends Record<string, unknown>, F extends boolean> = {
  getStore<K extends keyof D>(name: K): Store<D[K], F>;
  getStoreNames(): IsPromise<Array<string>, F>;
  deleteStore(name: string): IsPromise<void, F>;
  clearStores(): IsPromise<void, F>;
  getMeta<T extends keyof M>(key: T): IsPromise<M[T] | undefined, F>;
  setMeta<T extends keyof M>(key: T, value: M[T]): IsPromise<void, F>;
  dispose(): IsPromise<void, F>;
};
type Store<T, F extends boolean> = {
  get(key: string): IsPromise<T | undefined, F>;
  set(key: string, value: T): IsPromise<void, F>;
  delete(key: string): IsPromise<void, F>;
  clear(): IsPromise<void, F>;
  keys(): IsPromise<Array<string>, F>;
  values(): IsPromise<Array<T>, F>;
  entries(): IsPromise<Array<[string, T]>, F>;
  batch(operations: Array<StoreOperations<T>>): IsPromise<Array<GetResult<T>>, F>;
};
type StoreSync<T = unknown> = Store<T, false>;
type StoreAsync<T = unknown> = Store<T, true>;
type DatabaseSync<D extends Record<string, unknown> = Record<string, unknown>, M extends Record<string, unknown> = {}> = Database<D, M, false>;
type DatabaseAsync<D extends Record<string, unknown> = Record<string, unknown>, M extends Record<string, unknown> = {}> = Database<D, M, true>;
type GetOperation = {
  type: 'get';
  key: string;
};
type GetResult<T> = {
  key: string;
  value: T | undefined;
};
type SetOperation<T> = {
  type: 'set';
  key: string;
  value: T;
};
type DeleteOperation = {
  type: 'delete';
  key: string;
};
type StoreOperations<T> = GetOperation | SetOperation<T> | DeleteOperation;
type IsPromise<T, F extends boolean> = F extends true ? Promise<T> : T;
//#endregion
//#region src/modules/Storage.d.ts
type RecordStore = StoreAsync<RecordStat>;
declare class Storage {
  private readonly ctx;
  private readonly memoryDB;
  private readonly indexedDB;
  constructor(ctx: {
    getNamespace: () => string;
  });
  private readonly getRecordStore;
  private readonly deleteRecordStore;
  private readonly clearRecordStores;
  private readonly recordStoreExists;
  readonly root: {
    clearRecordStores: () => Promise<void>;
    deleteRecordStore: (namespace?: string) => MaybePromise<void>;
    getRecordStore: (namespace?: string) => {
      get(key: string): Promise<RecordStat | undefined>;
      set(key: string, value: RecordStat): Promise<void>;
      delete(key: string): Promise<void>;
      clear(): Promise<void>;
      keys(): Promise<string[]>;
      values(): Promise<RecordStat[]>;
      entries(): Promise<[string, RecordStat][]>;
      batch(operations: StoreOperations<RecordStat>[]): Promise<GetResult<RecordStat>[]>;
    };
    indexedDB: DatabaseAsync<General, General>;
    memoryDB: {
      getStore<K extends string | number | symbol>(name: K): {
        get(key: string): any;
        set(key: string, value: any): void;
        delete(key: string): void;
        clear(): void;
        keys(): string[];
        values(): any[];
        entries(): [string, any][];
        batch(operations: StoreOperations<any>[]): GetResult<any>[];
      };
      getStoreNames(): string[];
      deleteStore(name: string): void;
      clearStores(): void;
      getMeta<T extends string | number | symbol>(key: T): any;
      setMeta<T extends string | number | symbol>(key: T, value: any): void;
      dispose(): void;
    };
    recordStoreExists: (namespace?: string) => MaybePromise<boolean>;
  };
  readonly dispose: () => void;
}
//#endregion
//#region src/sync/tasks/interface.d.ts
type BaseTaskOptions = {
  localFs: Fs;
  remoteFs: Fs;
  record: RecordStore;
};
type TaskNames = 'addRecord' | 'removeRecord' | 'createLocalDir' | 'createRemoteDir' | 'download' | 'resolveConflict' | 'removeLocal' | 'removeRemote' | 'upload' | 'moveLocal' | 'moveRemote';
type ConflictResolverPayload = {
  local: FileStat;
  remote: FileStat;
  key: string;
  localFs: Fs;
  remoteFs: Fs;
  record: RecordStore;
};
type ConflictResolver = (payload: ConflictResolverPayload) => MaybePromise<void>;
declare abstract class BaseTask<T extends TaskOptions = TaskOptions> {
  readonly options: BaseTaskOptions & T;
  constructor(options: BaseTaskOptions & T);
  protected readonly remoteFs: Fs;
  protected readonly localFs: Fs;
  protected readonly record: RecordStore;
  name: TaskNames;
  prettyName: string;
  readonly key: string;
  readonly local: (BaseTaskOptions & T)['local'];
  readonly remote: (BaseTaskOptions & T)['remote'];
  abstract exec(): MaybePromise<void>;
}
//#endregion
//#region src/sync/tasks/AddRecord.d.ts
declare class AddRecord extends BaseTask<OptionsWithBothStats> {
  exec(): Promise<void>;
}
//#endregion
//#region src/sync/tasks/CreateRemoteDir.d.ts
declare class CreateRemoteDir extends BaseTask<OptionsWithLocalFolderStat> {
  exec(): Promise<void>;
}
//#endregion
//#region src/sync/tasks/Download.d.ts
declare class Download extends BaseTask<OptionsWithRemoteFileStat> {
  exec(): Promise<void>;
}
//#endregion
//#region src/sync/tasks/MoveLocal.d.ts
declare class MoveLocal extends BaseTask<OptionsWithRemoteStatAndOldKey> {
  exec(): Promise<void>;
}
//#endregion
//#region src/sync/tasks/MoveRemote.d.ts
declare class MoveRemote extends BaseTask<OptionsWithLocalStatAndOldKey> {
  exec(): Promise<void>;
}
//#endregion
//#region src/sync/tasks/RemoveLocal.d.ts
declare class RemoveLocal extends BaseTask<OptionsWithLocalStat> {
  exec(): Promise<void>;
}
//#endregion
//#region src/sync/tasks/RemoveRecord.d.ts
declare class RemoveRecord extends BaseTask {
  exec(): Promise<void>;
}
//#endregion
//#region src/sync/tasks/RemoveRemote.d.ts
declare class RemoveRemote extends BaseTask<OptionsWithRemoteStat> {
  exec(): Promise<void>;
}
//#endregion
//#region src/sync/tasks/ResolveConflict.d.ts
declare class ResolveConflict extends BaseTask<OptionsWithBothFileStats & {
  resolver: ConflictResolver;
}> {
  exec: () => MaybePromise<void>;
}
//#endregion
//#region src/sync/tasks/Upload.d.ts
declare class Upload extends BaseTask<OptionsWithLocalFileStat> {
  exec(): Promise<void>;
}
//#endregion
//#region src/sync/decision/interface.d.ts
type TaskOptions = {
  key: string;
  remote?: Stat$1;
  local?: Stat$1;
};
type OptionsWithRemoteFileStat = {
  remote: FileStat;
} & TaskOptions;
type OptionsWithLocalFileStat = {
  local: FileStat;
} & TaskOptions;
type OptionsWithRemoteFolderStat = {
  remote: FolderStat;
} & TaskOptions;
type OptionsWithLocalFolderStat = {
  local: FolderStat;
} & TaskOptions;
type OptionsWithLocalStat = {
  local: Stat$1;
} & TaskOptions;
type OptionsWithRemoteStat = {
  remote: Stat$1;
} & TaskOptions;
type OptionsWithBothStats = {
  local: Stat$1;
  remote: Stat$1;
} & TaskOptions;
type OptionsWithBothFileStats = {
  local: FileStat;
  remote: FileStat;
} & TaskOptions;
type OptionsWithLocalStatAndOldKey = {
  local: Stat$1;
  oldKey: string;
} & TaskOptions;
type OptionsWithRemoteStatAndOldKey = {
  remote: Stat$1;
  oldKey: string;
} & TaskOptions;
type TaskOptionsMap = {
  download: OptionsWithRemoteFileStat;
  upload: OptionsWithLocalFileStat;
  resolveConflict: OptionsWithBothFileStats;
  removeLocal: OptionsWithLocalStat;
  removeRemote: OptionsWithRemoteStat;
  createLocalDir: OptionsWithRemoteFolderStat;
  createRemoteDir: OptionsWithLocalFolderStat;
  removeRecord: TaskOptions;
  addRecord: OptionsWithBothStats;
  moveLocal: OptionsWithRemoteStatAndOldKey;
  moveRemote: OptionsWithLocalStatAndOldKey;
};
declare const taskMap: {
  readonly addRecord: typeof AddRecord;
  readonly createLocalDir: typeof CreateLocalDir;
  readonly createRemoteDir: typeof CreateRemoteDir;
  readonly download: typeof Download;
  readonly moveLocal: typeof MoveLocal;
  readonly moveRemote: typeof MoveRemote;
  readonly removeLocal: typeof RemoveLocal;
  readonly removeRecord: typeof RemoveRecord;
  readonly removeRemote: typeof RemoveRemote;
  readonly resolveConflict: typeof ResolveConflict;
  readonly upload: typeof Upload;
};
type TaskFactory = <N extends TaskNames>(name: N, options: TaskOptionsMap[N]) => InstanceType<(typeof taskMap)[N]>;
type Decider = (input: DeciderInput) => Array<BaseTask>;
type DeciderInput = {
  localStats: StatsMap;
  remoteStats: StatsMap;
  records: RecordStatsMap;
  taskFactory: TaskFactory;
  logger: (log: string) => void;
};
//#endregion
//#region src/sync/tasks/CreateLocalDir.d.ts
declare class CreateLocalDir extends BaseTask<OptionsWithRemoteFolderStat> {
  exec(): Promise<void>;
}
//#endregion
//#region src/modules/Registrar.d.ts
type RejectableWrapper<T> = (value: T) => T | undefined;
type OrderedWrapperEntry<T> = {
  priority: number;
  apply: RejectableWrapper<T>;
};
type RemoteRequestMiddlewareEntry = OrderedWrapperEntry<Request>;
type LocalRequestMiddlewareEntry = OrderedWrapperEntry<VaultRequest>;
type FsWrapperEntry = OrderedWrapperEntry<Fs>;
type CheckConnectionResult = {
  success: true;
} | {
  success: false;
  reason: string;
};
type RemoteFsEntry = {
  instantiate: (request: Request) => RootFs;
  prettyName: () => string;
  checkConnection: (request: Request) => MaybePromise<CheckConnectionResult>;
};
type DeciderEntry = {
  decider: Decider;
  prettyName: () => string;
};
type ConflictResolverEntry = {
  prettyName: () => string;
  resolver: ConflictResolver;
};
type GeneralFn = (...args: ReadonlyArray<General>) => unknown;
type RejectableApply<F extends GeneralFn> = (...input: Parameters<F>) => ReturnType<F> | undefined;
type OrderedApplyEntry<F extends GeneralFn> = {
  apply: RejectableApply<F>;
  priority: number;
};
type RemoteLister = (info: Infras & {
  trigger: string;
  reporter: ListReporter;
}) => MaybePromise<Array<Stat$1>>;
type RemoteListerEntry = OrderedApplyEntry<RemoteLister>;
type OptimizerEntry = OrderedApplyEntry<BatchOptimizer>;
type RequestParam = Omit<RequestUrlParam, 'body'> & {
  body?: string | Binary;
};
type RequestResponse = {
  text: () => string;
  bytes: () => Binary;
  json: () => General;
  headers: Record<string, string>;
  status: number;
};
type Request = (params: RequestParam | string) => Promise<RequestResponse>;
type Infras = {
  localFs: Fs;
  remoteFs: Fs;
  record: RecordStore;
};
declare class Registrar {
  private readonly ctx;
  private readonly cleanupCallbacks;
  private readonly localFsWrapperRegistry;
  private readonly remoteFsWrapperRegistry;
  private readonly localOptimizerRegistry;
  private readonly remoteOptimizerRegistry;
  private readonly remoteListerRegistry;
  private readonly remoteRequestMiddlewareRegistry;
  private readonly localRequestMiddlewareRegistry;
  private readonly remoteFsRegistry;
  private readonly deciderRegistry;
  private readonly conflictResolverRegistry;
  readonly settings: {
    remoteFs: string;
    decider: string;
    conflictResolver: string;
  };
  constructor(ctx: {
    app: App;
    getRecordStore: (namespace?: string) => StoreAsync<RecordStat>;
  });
  private readonly getVaultRequest;
  private readonly createLocalFs;
  private readonly createRemoteFs;
  private readonly getRequest;
  private readonly getCheckConnection;
  private readonly getDecider;
  private readonly optimizeLocal;
  private readonly optimizeRemote;
  private readonly listRemote;
  private readonly getConflictResolver;
  private readonly getNamespace;
  private readonly initializeSync;
  root: {
    conflictResolverRegistry: Map<string, ConflictResolverEntry>;
    createLocalFs: () => Fs;
    createRemoteFs: (remoteFs?: string) => Fs;
    deciderRegistry: Map<string, DeciderEntry>;
    getCheckConnection: (remoteFs?: string) => () => MaybePromise<CheckConnectionResult>;
    getConflictResolver: () => ConflictResolver;
    getDecider: () => Decider;
    getNamespace: (localFs?: Fs, remoteFs?: Fs) => string;
    getRequest: () => Request;
    getVaultRequest: () => VaultRequest;
    initializeSync: () => Infras;
    listRemote: RemoteLister;
    optimizeLocal: BatchOptimizer;
    optimizeRemote: BatchOptimizer;
    registerConflictResolver: (key: string, entry: ConflictResolverEntry) => () => boolean;
    registerCss: (css: string) => () => void;
    registerDecider: (key: string, entry: DeciderEntry) => () => boolean;
    registerLocalFsWrapper: (entry: FsWrapperEntry) => () => boolean;
    registerLocalOptimizer: (entry: OptimizerEntry) => () => boolean;
    registerLocalRequestMiddleware: (entry: LocalRequestMiddlewareEntry) => () => boolean;
    registerRemoteFs: (key: string, entry: RemoteFsEntry) => () => boolean;
    registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => boolean;
    registerRemoteLister: (entry: RemoteListerEntry) => () => boolean;
    registerRemoteOptimizer: (entry: OptimizerEntry) => () => boolean;
    registerRemoteRequestMiddleware: (entry: RemoteRequestMiddlewareEntry) => () => boolean;
    remoteFsRegistry: Map<string, RemoteFsEntry>;
  };
  readonly dispose: () => void;
}
//#endregion
//#region src/fs/vault/request.d.ts
type VaultRequestParam = {
  method: 'GET';
  key: string;
} | {
  method: 'GET_STREAM';
  key: string;
} | {
  method: 'PUT';
  key: string;
  value: Binary;
  headers?: {
    mtime?: number;
    ctime?: number;
  };
} | {
  method: 'APPEND';
  key: string;
  value: Binary;
  headers?: {
    mtime?: number;
    ctime?: number;
  };
} | {
  method: 'DELETE';
  key: string;
  headers?: {
    permanent?: boolean;
  };
} | {
  method: 'MOVE';
  key: string;
  headers: {
    destination: string;
  };
} | {
  method: 'MKDIR';
  key: string;
} | {
  method: 'EXISTS';
  key: string;
} | {
  method: 'STAT';
  key: string;
  headers?: {
    cached?: boolean;
  };
} | {
  method: 'LIST';
  key: string;
  headers?: {
    cached?: boolean;
  };
};
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
type VaultRequest = <T extends VaultRequestParam>(params: T) => Promise<VaultRequestResponseMap[T['method']]>;
//#endregion
export { RootFs as $, AddRecord as A, StoreOperations as B, RemoveRemote as C, MoveLocal as D, MoveRemote as E, RecordStore as F, Fs as G, BatchOptimizer as H, Storage as I, MkdirAtom as J, InputAtom as K, DatabaseAsync as L, ConflictResolver as M, ConflictResolverPayload as N, Download as O, TaskNames as P, OutputAtom as Q, DatabaseSync as R, ResolveConflict as S, RemoveLocal as T, CustomAtom as U, StoreSync as V, DeleteAtom as W, OptimizerInput as X, MoveAtom as Y, OptimizerOutput as Z, CreateLocalDir as _, FsWrapperEntry as a, MaybePromise as at, TaskFactory as b, OptimizerEntry as c, RecordStatsMap as ct, RemoteLister as d, TogglableValue as dt, WrappedFs as et, RemoteListerEntry as f, Binary as ft, RequestResponse as g, RequestParam as h, DeciderEntry as i, GlobMatchRule as it, BaseTask as j, CreateRemoteDir as k, Registrar as l, Stat$1 as lt, Request as m, CheckConnectionResult as n, FileStat as nt, Infras as o, Progress as ot, RemoteRequestMiddlewareEntry as p, General as pt, ListReporter as q, ConflictResolverEntry as r, FolderStat as rt, LocalRequestMiddlewareEntry as s, RecordStat as st, VaultRequest as t, WriteAtom as tt, RemoteFsEntry as u, StatsMap as ut, Decider as v, RemoveRecord as w, Upload as x, DeciderInput as y, StoreAsync as z };