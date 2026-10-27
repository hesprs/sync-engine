import { BaseTask } from './interface';
import type { WithLocalStat } from './interface';

export default class RemoveLocal extends BaseTask<WithLocalStat> {
	async exec() {
		const { key, localFs, record } = this;
		await localFs.delete(key);
		await record.delete(key);
	}
	readonly name = 'removeLocal';
}
