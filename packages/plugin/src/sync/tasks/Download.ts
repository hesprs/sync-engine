import { BaseTask } from './interface';
import { pipe } from '@/utils/pipe';
import type { OptionsWithRemoteFileStat } from '../decision/interface';

export default class Download extends BaseTask<OptionsWithRemoteFileStat> {
	async exec() {
		const { remote, record, remoteFs, localFs, key } = this;
		const uid = await pipe({ from: remoteFs, key, stat: remote, to: localFs });
		if (!uid) return;
		await record.set(key, { isDir: false, local: uid, remote: remote.uid });
	}
}
