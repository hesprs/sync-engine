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
