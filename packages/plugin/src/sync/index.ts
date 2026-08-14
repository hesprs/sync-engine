export { default as CreateLocalDir } from './tasks/CreateLocalDir';
export { default as CreateRemoteDir } from './tasks/CreateRemoteDir';
export { default as Download } from './tasks/Download';
export { default as Upload } from './tasks/Upload';
export { default as RemoveLocal } from './tasks/RemoveLocal';
export { default as RemoveRemote } from './tasks/RemoveRemote';
export { default as AddRecord } from './tasks/AddRecord';
export { default as RemoveRecord } from './tasks/RemoveRecord';
export { default as ResolveConflict } from './tasks/ResolveConflict';
export { default as MoveLocal } from './tasks/MoveLocal';
export { default as MoveRemote } from './tasks/MoveRemote';
export type {
	BaseTask,
	BaseTaskOptions,
	TaskNames,
	ConflictResolver,
	ConflictResolverPayload,
} from './tasks/interface';
export type {
	TaskOptions,
	TaskFactory,
	TaskOptionsMap,
	Decider,
	DeciderInput,
} from './decision/interface';
export { taskMap } from './decision/interface';
export { getTaskColor, getTaskIcon } from './tasks/interface';
export { default as detectMoves } from './utils/detect-moves';
export { default as bidirectionalDecider } from './decision/bidirectional';
export { mirrorLocalDecider, mirrorRemoteDecider } from './decision/mirror';
export { default as keepRemoteResolver } from './conflict-resolve/keep-remote';
export { default as keepLocalResolver } from './conflict-resolve/keep-local';
export { default as latestSurviveResolver } from './conflict-resolve/latest-survive';
export { default as renameAndKeepBothResolver } from './conflict-resolve/rename-and-keep-both';
export const syncCancelledError = new Error('Sync cancelled by user.');
