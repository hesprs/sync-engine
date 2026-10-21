import { BaseTask } from './interface';
import type { OptionsWithBothStats } from '../decision/interface';
import type { RecordStat, Stat } from '@/types';

export default class AddRecord extends BaseTask<OptionsWithBothStats> {
	async exec() {
		await this.record.set(this.key, toRecordStat(this.local, this.remote));
	}
}

function toRecordStat(local: Stat, remote: Stat): RecordStat {
	return !local.isDir && !remote.isDir
		? { isDir: false, local: local.uid, remote: remote.uid }
		: { isDir: true };
}
