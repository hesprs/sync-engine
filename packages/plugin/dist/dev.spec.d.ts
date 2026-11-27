import { $ as RecordStatsMap, C as Request, F as Fs, G as WrappedFs, J as FolderStat, Q as RecordStat, T as RequestResponse, W as RootFs, X as MaybePromise, c as TaskNames, et as Stat, it as Binary, nt as StringKV, q as FileStat, t as Decider, tt as StatsMap, w as RequestParam } from "./index-y5DUPq5d.spec.js";
/** Full SHA-256 over UTF-8 text or raw bytes, lowercase hex. */
export declare function sha256(input: string | Uint8Array): Promise<string>;
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
export { debugWrapper, testKit };