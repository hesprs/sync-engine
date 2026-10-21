import { BaseTask } from './interface';
import type { OptionsWithRemoteStat } from '../decision/interface';

export default class RemoveRemote extends BaseTask<OptionsWithRemoteStat> {
	async exec() {
		await this.remoteFs.delete(this.key);
		await this.record.delete(this.key);
	}
}
