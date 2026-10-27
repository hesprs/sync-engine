import { BaseTask } from './interface';
import { pipe } from '@/utils/pipe';
import type { WithRemoteFileStat } from './interface';

export default class Download extends BaseTask<WithRemoteFileStat> {
	async exec() {
		const { remote, record, remoteFs, localFs, key } = this;
		const uid = await pipe({ from: remoteFs, key, stat: remote, to: localFs });
		if (!uid) return;
		await record.set(key, { isDir: false, local: uid, remote: remote.uid });
	}
	readonly name = 'download';
}
