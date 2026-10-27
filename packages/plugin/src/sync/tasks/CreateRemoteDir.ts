import { BaseTask } from './interface';
import type { WithLocalFolderStat } from './interface';

export default class CreateRemoteDir extends BaseTask<WithLocalFolderStat> {
	async exec() {
		const { remoteFs, key, local, record } = this;
		await remoteFs.mkdir(key, local);
		await record.set(key, { isDir: true });
	}
	readonly name = 'createRemoteDir';
}
