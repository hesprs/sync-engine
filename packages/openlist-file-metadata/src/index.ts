import type {
	Events,
	FsWrapperEntry,
	LocalRequestMiddlewareEntry,
	On,
	RemoteRequestMiddlewareEntry,
	SelectFromContext,
} from '@hesprs/sync-engine-sdk';
import type { BackendSettings } from './target';
import MetadataLocalFs, { LocalSession, localMiddleware } from './local';
import MetadataRemoteFs, { RemoteSession, remoteMiddleware } from './remote';
import { getTarget } from './target';

export default class OpenListFileMetadata {
	private readonly cleanup: Array<() => void> = [];
	private readonly sessions = new Set<LocalSession | RemoteSession>();
	private local?: LocalSession;
	private remote?: RemoteSession;
	private active = false;

	constructor(
		private readonly ctx: SelectFromContext<{
			settings: BackendSettings;
			memoryDB?: { getStore: (name: 'remoteContext20000') => { clear: () => void } };
			on: On<Events>;
			registerLocalRequestMiddleware: (entry: LocalRequestMiddlewareEntry) => () => void;
			registerRemoteRequestMiddleware: (entry: RemoteRequestMiddlewareEntry) => () => void;
			registerLocalFsWrapper: (entry: FsWrapperEntry) => () => void;
			registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => void;
		}>,
	) {}

	readonly moduleSettings = {};
	private readonly enabled = () =>
		this.active &&
		(this.ctx.settings.remoteFs === 's3' || this.ctx.settings.remoteFs === 'webdav');

	readonly start = () => {
		this.active = true;
		// Realtime fast mode must not reuse a list created before directory repair.
		this.ctx.memoryDB?.getStore('remoteContext20000').clear();
		this.cleanup.push(
			this.ctx.registerLocalRequestMiddleware({
				apply: (request) => {
					this.local = new LocalSession(this.enabled);
					this.sessions.add(this.local);
					return localMiddleware(request, this.local);
				},
				priority: 3001,
			}),
			this.ctx.registerLocalFsWrapper({
				apply: (fs) => (this.local ? new MetadataLocalFs(fs, this.local) : undefined),
				priority: 500,
			}),
			this.ctx.registerRemoteRequestMiddleware({
				apply: (request) => {
					this.remote = undefined;
					const target = getTarget(this.ctx.settings);
					if (!target) return;
					this.remote = new RemoteSession(target, this.enabled);
					this.sessions.add(this.remote);
					return remoteMiddleware(request, this.remote);
				},
				priority: 4001,
			}),
			this.ctx.registerRemoteFsWrapper({
				apply: (fs) => (this.remote ? new MetadataRemoteFs(fs, this.remote) : undefined),
				priority: 500,
			}),
			this.ctx.on('syncTerminated', this.clear),
		);
	};

	private readonly clear = () => {
		for (const session of this.sessions) session.clear();
		this.sessions.clear();
		this.local = undefined;
		this.remote = undefined;
	};

	readonly dispose = () => {
		this.active = false;
		this.cleanup.splice(0).forEach((fn) => fn());
		this.clear();
	};
}
