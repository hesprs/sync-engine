import type { FsWrapperEntry, SelectFromContext } from '@hesprs/sync-engine-sdk';
import { digOriginal } from '@hesprs/sync-engine-sdk';
import RcloneFs from '@/remote';

export default class S3Rclone {
	private readonly cleanup: Array<() => void> = [];

	constructor(
		private readonly ctx: SelectFromContext<{
			settings: {
				remoteFs: string;
				asymmetricStorage: boolean;
			};
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
					return new RcloneFs(fs, !this.ctx.settings.asymmetricStorage);
				},
				priority: 500,
			}),
		);
	};

	readonly dispose = () => this.cleanup.splice(0).forEach((fn) => fn());
}
