import { BaseTask } from './interface';
import moveValue from '@/utils/move-value';
import type { WithOldKey } from './interface';

export default class MoveRemote extends BaseTask<WithOldKey> {
	async exec() {
		const { key, oldKey, remoteFs, record } = this.options;
		await remoteFs.move(oldKey, key);
		await moveValue({ newKey: key, oldKey, store: record });
	}
	readonly name = 'moveRemote';
}
