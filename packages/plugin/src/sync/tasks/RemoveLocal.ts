import { BaseTask } from './interface';
import type { OptionsWithLocalStat } from '../decision/interface';

export default class RemoveLocal extends BaseTask<OptionsWithLocalStat> {
	async exec() {
		await this.localFs.delete(this.key);
		await this.record.delete(this.key);
	}
}
