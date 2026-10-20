import type { BaseTask } from '../tasks/interface';
import type { DeciderInput } from './interface';

// Decider for the specific case that a folder's strategy is set to "none", but it has at least one descendant at a non-none strategy: a pholder
export default function pholderDecider(
	input: DeciderInput,
	logger: (log: string) => void,
): Array<BaseTask> {
	const { localStats, remoteStats, taskFactory } = input;
	const tasks: Array<BaseTask> = [];
	new Set([...localStats.keys(), ...remoteStats.keys()]).forEach((key) => {
		const remote = remoteStats.get(key);
		const local = localStats.get(key);
		if (!remote && local?.isDir) {
			tasks.push(taskFactory('createRemoteDir', { key, local }));
			logger(`Decider: mkdir remote \`${key}\`, reason: pholder.`);
		}
		if (!local && remote?.isDir) {
			tasks.push(taskFactory('createLocalDir', { key, remote }));
			logger(`Decider: mkdir local \`${key}\`, reason: pholder.`);
		}
	});
	return tasks;
}
