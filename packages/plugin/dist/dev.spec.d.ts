import { Bt as Binary, Ft as RecordStat, It as RecordStatsMap, K as TaskNames, Lt as Stat, Mt as FolderStat, Nt as MaybePromise, Ot as RootFs, Rt as StatsMap, d as RequestResponse, jt as FileStat, kt as WrappedFs, l as Request, u as RequestParam, yt as Fs, z as Decider, zt as StringKV } from "./index-r0HV0XqQ.spec.js";
declare function debugWrapper(original: Fs, log: (content: string) => void): WrappedFs;
type FsCalls = {
  delete: Array<string>;
  exists: Array<string>;
  list: Array<string>;
  mkdir: Array<[string, FolderStat, boolean | undefined]>;
  move: Array<[string, string]>;
  read: Array<[string, FileStat]>;
  readStream: Array<[string, FileStat]>;
  stat: Array<string>;
  write: Array<[string, Binary, FileStat]>;
  writeStream: Array<[string, FileStat]>;
};
type FsOptions = {
  control?: Partial<Fs>;
  uid?: string;
};
type FsHarness = {
  calls: FsCalls;
  control: Fs;
  fs: RootFs;
};
type ResponseControl = (url: string, params: RequestParam) => MaybePromise<ResponseOverrides>;
type RequestHarness = {
  calls: Array<RequestParam & {
    url: string;
  }>;
  request: Request;
};
type ExtractedTask = {
  key: string;
  local?: Stat;
  name: TaskNames;
  remote?: Stat;
};
declare function bytes(value: string): Binary;
declare function file(key: string, options?: {
  mtime?: number;
  size?: number;
  uid?: string;
  meta?: () => StringKV;
}): FileStat;
declare function folder(key: string, meta?: () => StringKV): FolderStat;
declare function fileRecord(local: string, remote: string): RecordStat;
declare function folderRecord(): RecordStat;
declare function runDecider(decider: Decider, input: {
  localStats?: StatsMap;
  remoteStats?: StatsMap;
  records?: RecordStatsMap;
}): Array<ExtractedTask>;
declare function taskNames(tasks: Array<ExtractedTask>): Array<string>;
declare function taskKeys(tasks: Array<ExtractedTask>): Array<string>;
declare function findTask(tasks: Array<ExtractedTask>, key: string): ExtractedTask;
declare function stream(chunks?: Array<string | Binary>): ReadableStream<Binary>;
declare function deferred<T>(): {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
};
declare function flush(turns?: number): Promise<void>;
type ResponseOverrides = Partial<Omit<RequestResponse, 'json'>> & {
  json?: () => unknown;
};
declare function request(control: ResponseControl): RequestHarness;
declare function fs(options?: FsOptions): FsHarness;
declare const testKit: {
  bytes: typeof bytes;
  deferred: typeof deferred;
  file: typeof file;
  fileRecord: typeof fileRecord;
  findTask: typeof findTask;
  flush: typeof flush;
  folder: typeof folder;
  folderRecord: typeof folderRecord;
  fs: typeof fs;
  request: typeof request;
  runDecider: typeof runDecider;
  stream: typeof stream;
  taskKeys: typeof taskKeys;
  taskNames: typeof taskNames;
};
declare function sha256(input: string): Promise<string>;
export { debugWrapper, sha256, testKit };