import { BaseTask } from './interface';
import moveValue from '@/utils/move-value';
import type { OptionsWithLocalStatAndOldKey } from '../decision/interface';

export default class MoveRemote extends BaseTask<OptionsWithLocalStatAndOldKey> {
	async exec() {
		const { key, oldKey } = this.options;
		await this.remoteFs.move(oldKey, key);
		await moveValue({ newKey: key, oldKey, store: this.record });
	}
}
