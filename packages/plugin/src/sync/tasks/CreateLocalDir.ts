import { BaseTask } from './interface';
import type { WithRemoteFolderStat } from './interface';

export default class CreateLocalDir extends BaseTask<WithRemoteFolderStat> {
	async exec() {
		const { localFs, key, remote, record } = this;
		await localFs.mkdir(key, remote);
		await record.set(key, { isDir: true });
	}
	readonly name = 'createLocalDir';
}
