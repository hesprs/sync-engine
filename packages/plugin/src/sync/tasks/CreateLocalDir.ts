import type { OptionsWithRemoteFolderStat } from '../decision/interface';
import { BaseTask } from './interface';

export default class CreateLocalDir extends BaseTask<OptionsWithRemoteFolderStat> {
	async exec() {
		await this.localFs.mkdir(this.key, this.remote);
		await this.record.set(this.key, { isDir: true });
	}
}
