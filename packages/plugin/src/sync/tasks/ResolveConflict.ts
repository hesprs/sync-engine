import { BaseTask } from './interface';
import type { ConflictResolver, WithBothFileStats } from './interface';

export default class ResolveConflict extends BaseTask<
	WithBothFileStats & { resolver: ConflictResolver }
> {
	exec = () => this.options.resolver(this);
	readonly name = 'resolveConflict';
}
