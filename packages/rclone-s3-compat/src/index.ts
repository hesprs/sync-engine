import RcloneFs from '@/remote';
import { digOriginal } from '@hesprs/sync-engine-sdk';
import type { FsWrapperEntry, SelectFromContext } from '@hesprs/sync-engine-sdk';

export default class RcloneS3Compat {
	private readonly cleanup: Array<() => void> = [];

	constructor(
		private readonly ctx: SelectFromContext<{
			settings: { remoteFs: string };
			registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => void;
		}>,
	) {}

	readonly start = () => {
		this.cleanup.push(
			this.ctx.registerRemoteFsWrapper({
				apply: (fs) => {
					if (this.ctx.settings.remoteFs !== 's3') return;
					const backend = digOriginal(fs);
					if (!backend.getUid().startsWith('s3~')) return;
					return new RcloneFs(fs);
				},
				priority: 500,
			}),
		);
	};

	readonly dispose = () => this.cleanup.splice(0).forEach((fn) => fn());
}
