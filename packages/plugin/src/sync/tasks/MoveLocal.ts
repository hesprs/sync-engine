import { BaseTask } from './interface';
import moveValue from '@/utils/move-value';
import type { WithNewKey } from './interface';

export default class MoveLocal extends BaseTask<WithNewKey> {
	async exec() {
		const { key, newKey, localFs, record } = this.options;
		await localFs.move(key, newKey);
		await moveValue({ newKey, oldKey: key, store: record });
	}
	readonly name = 'moveLocal';
}
