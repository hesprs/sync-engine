import { BaseTask } from './interface';
import moveValue from '@/utils/move-value';
import type { WithNewKey } from './interface';

export default class MoveRemote extends BaseTask<WithNewKey> {
	async exec() {
		const { key, newKey, remoteFs, record } = this.options;
		await remoteFs.move(key, newKey);
		await moveValue({ newKey, oldKey: key, store: record });
	}
	readonly name = 'moveRemote';
}
