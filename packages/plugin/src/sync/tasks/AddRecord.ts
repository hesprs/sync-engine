import { BaseTask } from './interface';
import type { WithBothStats } from './interface';
import type { RecordStat, Stat } from '@/types';

export default class AddRecord extends BaseTask<WithBothStats> {
	async exec() {
		const { record, key, local, remote } = this;
		await record.set(key, toRecordStat(local, remote));
	}
	readonly name = 'addRecord';
}

function toRecordStat(local: Stat, remote: Stat): RecordStat {
	return !local.isDir && !remote.isDir
		? { isDir: false, local: local.uid, remote: remote.uid }
		: { isDir: true };
}
