import { BaseTask } from './interface';
import moveValue from '@/utils/move-value';
import type { OptionsWithRemoteStatAndOldKey } from '../decision/interface';

export default class MoveLocal extends BaseTask<OptionsWithRemoteStatAndOldKey> {
	async exec() {
		const { key, oldKey } = this.options;
		await this.localFs.move(oldKey, key);
		await moveValue({ newKey: key, oldKey, store: this.record });
	}
}
