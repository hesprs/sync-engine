import { BaseTask } from './interface';
import type { WithBothFileStats, ConflictResolver } from './interface';

export default class ResolveConflict extends BaseTask<
	WithBothFileStats & { resolver: ConflictResolver }
> {
	exec = () => this.options.resolver(this);
	readonly name = 'resolveConflict';
}
