import { BaseTask } from './interface';
import type { WithRemoteStat } from './interface';

export default class RemoveRemote extends BaseTask<WithRemoteStat> {
	async exec() {
		const { remoteFs, record, key } = this;
		await remoteFs.delete(key);
		await record.delete(key);
	}
	readonly name = 'removeRemote';
}
