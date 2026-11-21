import { DataWriteOptions, ListedFiles, PluginManifest, RequestUrlParam, Stat as Stat$1 } from "obsidian";
type General = any;
type Binary = Uint8Array<ArrayBuffer>;
type MaybePromise<T> = Promise<T> | T;
type TogglableValue<T = number> = {
  enabled: boolean;
  value: T;
};
type StringKV = Record<string, string>;
type FileStat = {
  isDir: false;
  key: string;
  mtime: number;
  size: number;
  uid: string;
  meta: () => MaybePromise<StringKV>;
};
type FolderStat = {
  isDir: true;
  key: string;
  meta: () => MaybePromise<StringKV>;
};
type Stat = FileStat | FolderStat;
type RecordStat = {
  isDir: false;
  local: string;
  remote: string;
} | {
  isDir: true;
};
type StatsMap = Map<string, Stat>;
type RecordStatsMap = Map<string, RecordStat>;
type GlobStrategy = {
  expr: string;
  strategy: string;
};
type Progress<T = string> = {
  total: number;
  completed: number;
  current?: T;
};
/**
 * All keys use unified format:
 *
 * - Root: `/`
 * - File: `note.md`, `folder/note.md`
 * - Folder: `folder/`, `folder/nested/`
 */
type RootFs = {
  getUid(): string;
  read(key: string, stat: FileStat): MaybePromise<Binary>;
  readStream(key: string, stat: FileStat): MaybePromise<ReadableStream<Binary>>;
  write(key: string, value: MaybePromise<Binary>, stat: FileStat): MaybePromise<string>;
  writeStream(key: string, value: MaybePromise<ReadableStream<Binary>>, stat: FileStat): MaybePromise<string>;
  delete(key: string): MaybePromise<void>;
  move(oldKey: string, newKey: string): MaybePromise<void>;
  mkdir(key: string, stat: FolderStat, recursive?: boolean): MaybePromise<void>;
  stat(key: string): MaybePromise<Stat>;
  exists(key: string): MaybePromise<boolean>;
  list(key: string, reporter: ListReporter): MaybePromise<Array<Stat>>;
};
type ListOptions = 'include' | 'exclude' | 'advance';
type ListReporter = (progress: Required<Progress>) => MaybePromise<ListOptions>;
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
declare const OS: {
  'Android Tablet': boolean;
  iPadOS: boolean;
  Android: boolean;
  iOS: boolean;
  Linux: boolean;
  macOS: boolean;
  Windows: boolean;
};
type RequestParam = Omit<RequestUrlParam, 'body' | 'url'> & {
  body?: string | Binary;
  ignoreCancellation?: boolean;
};
type RequestResponse = {
  text: () => string;
  bytes: () => Binary;
  json: <T extends object = object>() => T;
  headers: StringKV;
  status: number;
};
type Request = (url: string, params?: RequestParam) => Promise<RequestResponse>;
declare function request(url: string, params?: RequestParam): Promise<RequestResponse>;
type VaultRequestParam = ({
  method: 'GET';
} | {
  method: 'GET_STREAM';
  size: number;
} | ({
  method: 'PUT';
  value: Binary;
} & DataWriteOptions) | ({
  method: 'APPEND';
  value: Binary;
} & DataWriteOptions) | {
  method: 'DELETE';
  trash?: TrashOption;
} | {
  method: 'MOVE';
  destination: string;
} | {
  method: 'MKDIR';
} | {
  method: 'EXISTS';
} | {
  method: 'STAT';
  cached?: boolean;
} | {
  method: 'LIST';
  cached?: boolean;
}) & {
  ignoreCancellation?: boolean;
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
  STAT: Stat$1;
  LIST: ListedFiles;
};
type VaultRequest = <T extends VaultRequestParam = {
  method: 'GET';
}>(key: string, params?: T) => Promise<VaultRequestResponseMap[T['method']]>;
type TrashOption = 'local' | 'system' | 'permanent';
declare class CreateLocalDir extends BaseTask<WithRemoteFolderStat> {
  exec(): Promise<void>;
  readonly name = "createLocalDir";
}
declare class CreateRemoteDir extends BaseTask<WithLocalFolderStat> {
  exec(): Promise<void>;
  readonly name = "createRemoteDir";
}
declare class Download extends BaseTask<WithRemoteFileStat> {
  exec(): Promise<void>;
  readonly name = "download";
}
declare class MoveLocal extends BaseTask<WithOldKey> {
  exec(): Promise<void>;
  readonly name = "moveLocal";
}
declare class MoveRemote extends BaseTask<WithOldKey> {
  exec(): Promise<void>;
  readonly name = "moveRemote";
}
declare class RemoveLocal extends BaseTask<WithLocalStat> {
  exec(): Promise<void>;
  readonly name = "removeLocal";
}
declare class RemoveRecord extends BaseTask {
  exec(): Promise<void>;
  readonly name = "removeRecord";
}
declare class RemoveRemote extends BaseTask<WithRemoteStat> {
  exec(): Promise<void>;
  readonly name = "removeRemote";
}
declare class ResolveConflict extends BaseTask<WithBothFileStats & {
  resolver: ConflictResolver;
}> {
  exec: () => MaybePromise<void>;
  readonly name = "resolveConflict";
}
declare class Upload extends BaseTask<WithLocalFileStat> {
  exec(): Promise<void>;
  readonly name = "upload";
}
type RecordStore = StoreAsync<RecordStat>;
declare class Storage {
  private readonly ctx;
  private readonly memoryDB;
  private readonly indexedDB;
  readonly root: {
    clearRecordStores: () => Promise<void>;
    deleteRecordStore: (namespace?: string) => MaybePromise<void>;
    getRecordStore: <N extends string | undefined>(namespace?: N) => N extends string ? RecordStore : RecordStore | undefined;
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
  constructor(ctx: {
    getNamespace: () => string | Error;
    manifest: PluginManifest;
  });
  private readonly getRecordStore;
  private readonly deleteRecordStore;
  private readonly clearRecordStores;
  private readonly recordStoreExists;
  readonly dispose: () => void;
}
type BaseTaskOptions = {
  localFs: Fs;
  remoteFs: Fs;
  record: RecordStore;
};
type GenericOptions = {
  key: string;
  local?: Stat;
  remote?: Stat;
};
type WithRemoteFileStat = {
  remote: FileStat;
} & GenericOptions;
type WithLocalFileStat = {
  local: FileStat;
} & GenericOptions;
type WithRemoteFolderStat = {
  remote: FolderStat;
} & GenericOptions;
type WithLocalFolderStat = {
  local: FolderStat;
} & GenericOptions;
type WithLocalStat = {
  local: Stat;
} & GenericOptions;
type WithRemoteStat = {
  remote: Stat;
} & GenericOptions;
type WithBothStats = {
  local: Stat;
  remote: Stat;
} & GenericOptions;
type WithBothFileStats = {
  local: FileStat;
  remote: FileStat;
} & GenericOptions;
type WithOldKey = {
  oldKey: string;
} & GenericOptions;
type TaskOptionsMap = {
  download: WithRemoteFileStat;
  upload: WithLocalFileStat;
  resolveConflict: WithBothFileStats;
  removeLocal: WithLocalStat;
  removeRemote: WithRemoteStat;
  createLocalDir: WithRemoteFolderStat;
  createRemoteDir: WithLocalFolderStat;
  removeRecord: GenericOptions;
  addRecord: WithBothStats;
  moveLocal: WithOldKey;
  moveRemote: WithOldKey;
};
type TaskNames = 'addRecord' | 'removeRecord' | 'createLocalDir' | 'createRemoteDir' | 'download' | 'resolveConflict' | 'removeLocal' | 'removeRemote' | 'upload' | 'moveLocal' | 'moveRemote';
type Task = CreateLocalDir | CreateRemoteDir | Download | Upload | RemoveLocal | RemoveRemote | RemoveRecord | AddRecord | ResolveConflict | MoveLocal | MoveRemote;
type ConflictResolverPayload = {
  local: FileStat;
  remote: FileStat;
  key: string;
  localFs: Fs;
  remoteFs: Fs;
  record: RecordStore;
};
type ConflictResolver = (payload: ConflictResolverPayload) => MaybePromise<void>;
declare abstract class BaseTask<T extends GenericOptions = GenericOptions> {
  readonly options: BaseTaskOptions & T;
  constructor(options: BaseTaskOptions & T);
  readonly remoteFs: Fs;
  readonly localFs: Fs;
  readonly record: RecordStore;
  readonly key: string;
  readonly local: T['local'];
  readonly remote: T['remote'];
  abstract exec(): MaybePromise<void>;
  abstract readonly name: TaskNames;
}
declare class AddRecord extends BaseTask<WithBothStats> {
  exec(): Promise<void>;
  readonly name = "addRecord";
}
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
type Decider = (input: DeciderInput) => Array<Task>;
type DeciderInput = {
  localStats: StatsMap;
  remoteStats: StatsMap;
  records: RecordStatsMap;
  taskFactory: TaskFactory;
};
export { RecordStatsMap as $, StoreOperations as A, MoveAtom as B, Request as C, DatabaseAsync as D, request as E, Fs as F, WrappedFs as G, OptimizerOutput as H, InputAtom as I, FolderStat as J, WriteAtom as K, ListOptions as L, BatchOptimizer as M, CustomAtom as N, DatabaseSync as O, DeleteAtom as P, RecordStat as Q, ListReporter as R, OS as S, RequestResponse as T, OutputAtom as U, OptimizerInput as V, RootFs as W, MaybePromise as X, GlobStrategy as Y, Progress as Z, MoveLocal as _, ConflictResolver as a, General as at, CreateLocalDir as b, TaskNames as c, Upload as d, Stat as et, ResolveConflict as f, MoveRemote as g, RemoveLocal as h, AddRecord as i, Binary as it, StoreSync as j, StoreAsync as k, RecordStore as l, RemoveRecord as m, DeciderInput as n, StringKV as nt, ConflictResolverPayload as o, RemoveRemote as p, FileStat as q, TaskFactory as r, TogglableValue as rt, Task as s, Decider as t, StatsMap as tt, Storage as u, Download as v, RequestParam as w, VaultRequest as x, CreateRemoteDir as y, MkdirAtom as z };