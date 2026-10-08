import type { OptionsWithLocalFolderStat } from '../decision/interface';
import { BaseTask } from './interface';

export default class CreateRemoteDir extends BaseTask<OptionsWithLocalFolderStat> {
	async exec() {
		await this.remoteFs.mkdir(this.key, this.local);
		await this.record.set(this.key, { isDir: true });
	}
}
