import AddRecord from '../tasks/AddRecord';
import CreateLocalDir from '../tasks/CreateLocalDir';
import CreateRemoteDir from '../tasks/CreateRemoteDir';
import Download from '../tasks/Download';
import MoveLocal from '../tasks/MoveLocal';
import MoveRemote from '../tasks/MoveRemote';
import RemoveLocal from '../tasks/RemoveLocal';
import RemoveRecord from '../tasks/RemoveRecord';
import RemoveRemote from '../tasks/RemoveRemote';
import ResolveConflict from '../tasks/ResolveConflict';
import Upload from '../tasks/Upload';
import type { Task, TaskNames, TaskOptionsMap } from '../tasks/interface';
import type { RecordStatsMap, StatsMap } from '@/types';

export const taskMap = {
	addRecord: AddRecord,
	createLocalDir: CreateLocalDir,
	createRemoteDir: CreateRemoteDir,
	download: Download,
	moveLocal: MoveLocal,
	moveRemote: MoveRemote,
	removeLocal: RemoveLocal,
	removeRecord: RemoveRecord,
	removeRemote: RemoveRemote,
	resolveConflict: ResolveConflict,
	upload: Upload,
} as const;
export type TaskFactory = <N extends TaskNames>(
	name: N,
	options: TaskOptionsMap[N],
) => InstanceType<(typeof taskMap)[N]>;

export type Decider = (input: DeciderInput) => Array<Task>;

export type DeciderInput = {
	localStats: StatsMap;
	remoteStats: StatsMap;
	records: RecordStatsMap;
	taskFactory: TaskFactory;
};
