import type { Fs } from '@/fs';
import type { RecordStore } from '@/modules/Storage';
import type { FileStat, MaybePromise } from '@/types';
import type { TaskOptions } from '../decision/interface';

export type BaseTaskOptions = {
	localFs: Fs;
	remoteFs: Fs;
	record: RecordStore;
};

export type TaskNames =
	| 'addRecord'
	| 'removeRecord'
	| 'createLocalDir'
	| 'createRemoteDir'
	| 'download'
	| 'resolveConflict'
	| 'removeLocal'
	| 'removeRemote'
	| 'upload'
	| 'moveLocal'
	| 'moveRemote';

export type ConflictResolverPayload = {
	local: FileStat;
	remote: FileStat;
	key: string;
	localFs: Fs;
	remoteFs: Fs;
	record: RecordStore;
};

export type ConflictResolver = (payload: ConflictResolverPayload) => MaybePromise<void>;

export abstract class BaseTask<T extends TaskOptions = TaskOptions> {
	constructor(readonly options: BaseTaskOptions & T) {
		this.remoteFs = options.remoteFs;
		this.localFs = options.localFs;
		this.record = options.record;
		this.key = options.key;
		this.local = options.local;
		this.remote = options.remote;
	}
	protected readonly remoteFs: Fs;
	protected readonly localFs: Fs;
	protected readonly record: RecordStore;
	declare name: TaskNames;
	declare prettyName: string;
	readonly key: string;
	readonly local: (BaseTaskOptions & T)['local'];
	readonly remote: (BaseTaskOptions & T)['remote'];

	abstract exec(): MaybePromise<void>;
}

const RED = 'var(--color-red)';
const PINK = 'var(--color-pink)';
const BLUE = 'var(--color-blue)';
const GREEN = 'var(--color-green)';
const YELLOW = 'var(--color-yellow)';

export function getTaskIcon(name: TaskNames, isDir: boolean): string {
	if (name === 'createRemoteDir') return 'folder-up';
	if (name === 'createLocalDir') return 'folder-down';
	if (name === 'download') return 'file-down';
	if (name === 'upload') return 'file-up';
	if (name === 'resolveConflict') return 'combine';
	if (name === 'removeLocal' || name === 'removeRemote') return isDir ? 'folder-x' : 'file-x';
	if (name === 'moveLocal' || name === 'moveRemote')
		return isDir ? 'folder-output' : 'file-output';
	return 'refresh-cw';
}

export function getTaskColor(name: TaskNames): string {
	switch (name) {
		case 'resolveConflict': {
			return YELLOW;
		}
		case 'removeLocal': {
			return RED;
		}
		case 'removeRemote': {
			return PINK;
		}
		case 'createLocalDir':
		case 'download':
		case 'moveLocal': {
			return GREEN;
		}
		default: {
			return BLUE;
		}
	}
}
