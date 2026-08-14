import type { Fs, ListReporter, RootFs } from '@/fs';
import type { Request, RequestParam } from '@/modules/Registrar';
import type { Decider, TaskFactory, TaskNames, TaskOptions } from '@/sync';
import type {
	Binary,
	FileStat,
	FolderStat,
	RecordStat,
	RecordStatsMap,
	Stat,
	StatsMap,
} from '@/types';
import { taskMap } from '@/sync';

type FsCalls = {
	delete: Array<string>;
	exists: Array<string>;
	list: Array<string>;
	mkdir: Array<string>;
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

type RequestHarness = {
	calls: Array<RequestParam | string>;
	request: Request;
};

type ExtractedTask = {
	key: string;
	local?: Stat;
	name: TaskNames;
	remote?: Stat;
};

const textEncoder = new TextEncoder();

function bytes(value: string): Binary {
	return textEncoder.encode(value);
}

function file(
	key: string,
	options: { mtime?: number; size?: number; uid?: string } = {},
): FileStat {
	const { mtime = 1, size = 5, uid = `${key}-uid` } = options;
	return { isDir: false, key, mtime, size, uid };
}

function folder(key: string): FolderStat {
	return { isDir: true, key };
}

function fileRecord(local: string, remote: string): RecordStat {
	return { isDir: false, local, remote };
}

function folderRecord(): RecordStat {
	return { isDir: true };
}

function runDecider(
	decider: Decider,
	input: { localStats?: StatsMap; remoteStats?: StatsMap; records?: RecordStatsMap },
): Array<ExtractedTask> {
	const localStats = input.localStats ?? new Map<string, Stat>();
	const remoteStats = input.remoteStats ?? new Map<string, Stat>();
	const records = input.records ?? new Map<string, RecordStat>();
	const tasks: Array<ExtractedTask> = [];
	const taskFactory = ((name: TaskNames, options: TaskOptions) => {
		const Task = taskMap[name];
		const task = new Task({
			...options,
			localFs: {} as never,
			record: {} as never,
			remoteFs: {} as never,
		} as never);
		task.name = name;
		task.prettyName = name;
		tasks.push({
			key: options.key,
			name,
			...(options.local !== undefined && { local: options.local }),
			...(options.remote !== undefined && { remote: options.remote }),
		});
		return task;
	}) as TaskFactory;

	decider({ localStats, logger: () => {}, records, remoteStats, taskFactory });
	return tasks;
}

function taskNames(tasks: Array<ExtractedTask>): Array<string> {
	return tasks.map((task) => task.name);
}

function taskKeys(tasks: Array<ExtractedTask>): Array<string> {
	return tasks.map((task) => task.key);
}

function findTask(tasks: Array<ExtractedTask>, key: string): ExtractedTask {
	const matching = tasks.filter((task) => task.key === key);
	if (matching.length !== 1)
		throw new Error(`Expected one task for ${key}, found ${matching.length}.`);
	return matching[0];
}

function defaultStat(key: string): Stat {
	return key === '/' || key.endsWith('/')
		? folder(key)
		: file(key, { mtime: 10, size: 5, uid: 'uid' });
}

function stream(chunks: Array<string | Binary> = []): ReadableStream<Binary> {
	return new ReadableStream<Binary>({
		start(controller) {
			for (const chunk of chunks)
				controller.enqueue(typeof chunk === 'string' ? bytes(chunk) : chunk);
			controller.close();
		},
	});
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	return { promise, reject, resolve };
}

async function flush(turns = 4) {
	for (let index = 0; index < turns; index += 1)
		await new Promise<void>((resolve) => {
			queueMicrotask(resolve);
		});
}

function createCalls(): FsCalls {
	return {
		delete: [],
		exists: [],
		list: [],
		mkdir: [],
		move: [],
		read: [],
		readStream: [],
		stat: [],
		write: [],
		writeStream: [],
	};
}

function createControl(overrides: Partial<Fs> = {}): Fs {
	return {
		delete: () => {},
		exists: () => false,
		getUid: () => 'FsControl',
		list: (key: string) => [
			defaultStat(key),
			folder(`${key}folder/`),
			file(`${key}folder/note.md`, { mtime: 12, size: 7, uid: 'note-2' }),
		],
		mkdir: () => {},
		move: () => {},
		read: () => bytes(''),
		readStream: () => stream(),
		stat: (key: string) => defaultStat(key),
		write: () => 'write-uid',
		writeStream: () => 'stream-uid',
		...overrides,
	};
}

function request(control: Request): RequestHarness {
	const calls: Array<RequestParam | string> = [];
	return {
		calls,
		request: (params: RequestParam | string) => {
			calls.push(params);
			return control(params);
		},
	};
}

function fs(options: FsOptions = {}): FsHarness {
	const calls = createCalls();
	const control = createControl(options.control);
	const uid = options.uid ?? 'uid';

	const rootFs: RootFs = {
		delete: (key: string) => {
			calls.delete.push(key);
			return control.delete(key);
		},
		exists: (key: string) => {
			calls.exists.push(key);
			return control.exists(key);
		},
		getUid: () => uid,
		list: (key: string, reporter: ListReporter) => {
			calls.list.push(key);
			return control.list(key, reporter);
		},
		mkdir: (key: string, recursive?: boolean) => {
			calls.mkdir.push(key);
			return control.mkdir(key, recursive);
		},
		move: (oldKey: string, newKey: string) => {
			calls.move.push([oldKey, newKey]);
			return control.move(oldKey, newKey);
		},
		read: (key: string, stat: FileStat) => {
			calls.read.push([key, stat]);
			return control.read(key, stat);
		},
		readStream: (key: string, stat: FileStat) => {
			calls.readStream.push([key, stat]);
			return control.readStream(key, stat);
		},
		stat: (key: string) => {
			calls.stat.push(key);
			return control.stat(key);
		},
		write: (key: string, value: Binary, stat: FileStat) => {
			calls.write.push([key, value, stat]);
			return control.write(key, value, stat);
		},
		writeStream: (key: string, value: ReadableStream<Binary>, stat: FileStat) => {
			calls.writeStream.push([key, stat]);
			return control.writeStream(key, value, stat);
		},
	};

	return { calls, control, fs: rootFs };
}

const testKit = {
	bytes,
	deferred,
	file,
	fileRecord,
	findTask,
	flush,
	folder,
	folderRecord,
	fs,
	request,
	runDecider,
	stream,
	taskKeys,
	taskNames,
};

export default testKit;
