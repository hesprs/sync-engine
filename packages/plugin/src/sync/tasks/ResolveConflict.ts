import { BaseTask } from './interface';
import type { OptionsWithBothFileStats } from '../decision/interface';
import type { ConflictResolver } from './interface';

export default class ResolveConflict extends BaseTask<
	OptionsWithBothFileStats & { resolver: ConflictResolver }
> {
	exec = () =>
		this.options.resolver({
			key: this.key,
			local: this.local,
			localFs: this.localFs,
			record: this.record,
			remote: this.remote,
			remoteFs: this.remoteFs,
		});
}
