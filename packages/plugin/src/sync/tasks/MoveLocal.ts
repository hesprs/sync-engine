import { BaseTask } from './interface';
import moveValue from '@/utils/move-value';
import type { WithOldKey } from './interface';

export default class MoveLocal extends BaseTask<WithOldKey> {
	async exec() {
		const { key, oldKey, localFs, record } = this.options;
		await localFs.move(oldKey, key);
		await moveValue({ newKey: key, oldKey, store: record });
	}
	readonly name = 'moveLocal';
}
