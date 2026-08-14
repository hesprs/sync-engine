import type { FileStat } from '@/types';
import type { BaseTask } from '../tasks/interface';
import type { DeciderInput } from './interface';

type Source = 'local' | 'remote';

export function mirrorLocalDecider(input: DeciderInput): Array<BaseTask> {
	return mirrorDecider(input, 'local');
}

export function mirrorRemoteDecider(input: DeciderInput): Array<BaseTask> {
	return mirrorDecider(input, 'remote');
}

function mirrorDecider(input: DeciderInput, source: Source): Array<BaseTask> {
	const { localStats, logger, records, remoteStats, taskFactory } = input;
	const sourceStats = source === 'local' ? localStats : remoteStats;
	const targetStats = source === 'local' ? remoteStats : localStats;
	const tasks: Array<BaseTask> = [];

	for (const key of new Set([...sourceStats.keys(), ...targetStats.keys(), ...records.keys()])) {
		const sourceStat = sourceStats.get(key);
		const targetStat = targetStats.get(key);
		const record = records.get(key);

		if (!sourceStat) {
			if (targetStat) {
				logger(
					`Decider: remove ${source === 'local' ? 'remote' : 'local'} \`${key}\`, reason: mirror ${source}.`,
				);
				tasks.push(
					source === 'local'
						? taskFactory('removeRemote', { key, remote: targetStat })
						: taskFactory('removeLocal', { key, local: targetStat }),
				);
			} else if (record) tasks.push(taskFactory('removeRecord', { key }));
			continue;
		}

		const create = () => {
			logger(`Decider: mirror ${source} \`${key}\`, reason: target missing or incompatible.`);
			if (sourceStat.isDir)
				tasks.push(
					source === 'local'
						? taskFactory('createRemoteDir', { key, local: sourceStat })
						: taskFactory('createLocalDir', { key, remote: sourceStat }),
				);
			else
				tasks.push(
					source === 'local'
						? taskFactory('upload', { key, local: sourceStat })
						: taskFactory('download', { key, remote: sourceStat }),
				);
		};

		if (!targetStat) {
			create();
			continue;
		}
		if (sourceStat.isDir !== targetStat.isDir) {
			tasks.push(
				source === 'local'
					? taskFactory('removeRemote', { key, remote: targetStat })
					: taskFactory('removeLocal', { key, local: targetStat }),
			);
			create();
			continue;
		}
		if (sourceStat.isDir) {
			if (!record)
				tasks.push(
					taskFactory('addRecord', {
						key,
						...(source === 'local'
							? { local: sourceStat, remote: targetStat }
							: { local: targetStat, remote: sourceStat }),
					}),
				);
			continue;
		}
		const targetFile = targetStat as FileStat;
		if (!record && sourceStat.size === targetFile.size) {
			tasks.push(
				taskFactory('addRecord', {
					key,
					...(source === 'local'
						? { local: sourceStat, remote: targetFile }
						: { local: targetFile, remote: sourceStat }),
				}),
			);
			continue;
		}
		if (
			!record ||
			record.isDir ||
			record[source] !== sourceStat.uid ||
			record[source === 'local' ? 'remote' : 'local'] !== targetFile.uid
		)
			create();
	}

	return tasks;
}
