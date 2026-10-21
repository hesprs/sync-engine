import Download from '../tasks/Download';
import ResolveConflict from '../tasks/ResolveConflict';
import Upload from '../tasks/Upload';
import { isSub } from '@repo/shared/path';
import type { BaseTask } from '../tasks/interface';
import type { RecordStatsMap, StatsMap } from '@/types';

export default function isChanged({
	key,
	source,
	records,
	tasks,
	currentStats,
}: {
	key: string;
	source: 'local' | 'remote';
	records: RecordStatsMap;
	currentStats: StatsMap;
	tasks?: Array<BaseTask>;
}) {
	const inRecords = records.get(key);
	const record = inRecords
		? inRecords.isDir
			? { isDir: true }
			: { isDir: false, uid: inRecords[source] }
		: undefined;
	const target = currentStats.get(key);
	if (!record || !target) return true;
	// Unable to compare between directories and files
	if (target.isDir !== record.isDir) return true;
	// Compare files
	if (!target.isDir && !record.isDir) return target.uid !== record.uid;
	// Compare folders
	if (tasks)
		// Reuse tracked file changes
		for (const task of tasks)
			if (
				(task instanceof ResolveConflict ||
					task instanceof Upload ||
					task instanceof Download) &&
				isSub(key, task.key)
			)
				return true;
	for (const [subPath, stats] of currentStats) {
		// Check for subfolder changes
		if (!stats.isDir || !isSub(key, subPath)) continue;
		if (!records.get(subPath)) return true;
	}

	return false;
}
