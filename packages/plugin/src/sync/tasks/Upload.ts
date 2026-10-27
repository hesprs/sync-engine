import { BaseTask } from './interface';
import { pipe } from '@/utils/pipe';
import type { WithLocalFileStat } from './interface';

export default class Upload extends BaseTask<WithLocalFileStat> {
	async exec() {
		const { local, record, remoteFs, localFs, key } = this;
		const uid = await pipe({ from: localFs, key, stat: local, to: remoteFs });
		if (!uid) return;
		await record.set(key, { isDir: false, local: local.uid, remote: uid });
	}
	readonly name = 'upload';
}
