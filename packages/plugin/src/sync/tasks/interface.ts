import type AddRecord from './AddRecord';
import type CreateLocalDir from './CreateLocalDir';
import type CreateRemoteDir from './CreateRemoteDir';
import type Download from './Download';
import type MoveLocal from './MoveLocal';
import type MoveRemote from './MoveRemote';
import type RemoveLocal from './RemoveLocal';
import type RemoveRecord from './RemoveRecord';
import type RemoveRemote from './RemoveRemote';
import type ResolveConflict from './ResolveConflict';
import type Upload from './Upload';
import type { Fs } from '@/fs';
import type { RecordStore } from '@/modules/Storage';
import type { FileStat, FolderStat, MaybePromise, Stat } from '@/types';

type BaseTaskOptions = { localFs: Fs; remoteFs: Fs; record: RecordStore };
export type GenericOptions = { key: string; local?: Stat; remote?: Stat };
export type WithRemoteFileStat = { remote: FileStat } & GenericOptions;
export type WithLocalFileStat = { local: FileStat } & GenericOptions;
export type WithRemoteFolderStat = { remote: FolderStat } & GenericOptions;
export type WithLocalFolderStat = { local: FolderStat } & GenericOptions;
export type WithLocalStat = { local: Stat } & GenericOptions;
export type WithRemoteStat = { remote: Stat } & GenericOptions;
export type WithBothStats = { local: Stat; remote: Stat } & GenericOptions;
export type WithBothFileStats = { local: FileStat; remote: FileStat } & GenericOptions;
export type WithOldKey = { oldKey: string } & GenericOptions;

export type TaskOptionsMap = {
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

export type Task =
	| CreateLocalDir
	| CreateRemoteDir
	| Download
	| Upload
	| RemoveLocal
	| RemoveRemote
	| RemoveRecord
	| AddRecord
	| ResolveConflict
	| MoveLocal
	| MoveRemote;

export type ConflictResolverPayload = {
	local: FileStat;
	remote: FileStat;
	key: string;
	localFs: Fs;
	remoteFs: Fs;
	record: RecordStore;
};

export type ConflictResolver = (payload: ConflictResolverPayload) => MaybePromise<void>;

export abstract class BaseTask<T extends GenericOptions = GenericOptions> {
	constructor(readonly options: BaseTaskOptions & T) {
		const { record, remoteFs, localFs, key, local, remote } = options;
		this.remoteFs = remoteFs;
		this.localFs = localFs;
		this.record = record;
		this.key = key;
		this.local = local;
		this.remote = remote;
	}
	readonly remoteFs: Fs;
	readonly localFs: Fs;
	readonly record: RecordStore;
	readonly key: string;
	readonly local: T['local'];
	readonly remote: T['remote'];

	abstract exec(): MaybePromise<void>;
	abstract readonly name: TaskNames;
}

export function getTaskSide(name: TaskNames): 'local' | 'remote' | undefined {
	if (name === 'resolveConflict' || name === 'addRecord' || name === 'removeRecord') return;
	return name === 'download' || name === 'createLocalDir' || name.endsWith('Local')
		? 'local'
		: 'remote';
}
