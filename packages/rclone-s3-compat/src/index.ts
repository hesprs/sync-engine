import type {
	FsWrapperEntry,
	OptimizerEntry,
	Events,
	On,
	SelectFromContext,
	SettingEntry,
	Translate,
	ObsidianLanguageCode,
	TranslationResource,
} from '@hesprs/sync-engine-sdk';
import { digOriginal, s } from '@hesprs/sync-engine-sdk';
import type { RcloneTranslations } from '@/i18n';
import { en, zh, zhTW, ru } from '@/i18n';
import RcloneFs from '@/remote';

export default class S3Rclone {
	private readonly cleanup: Array<() => void> = [];
	private remoteFs?: RcloneFs;
	readonly moduleSettings = { ignoreEtags: false };

	constructor(
		private readonly ctx: SelectFromContext<{
			settings: {
				remoteFs: string;
				asymmetricStorage: boolean;
			};
			registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => void;
			registerRemoteOptimizer: (entry: OptimizerEntry) => () => void;
			on: On<Pick<Events, 'taskCompleted' | 'taskFailed' | 'syncCanceled'>>;
			registerSetting: (entry: SettingEntry) => () => void;
			registerI18n: (lang: ObsidianLanguageCode, resource: TranslationResource) => void;
			translate: Translate<RcloneTranslations>;
			saveSettings: () => Promise<void>;
		}>,
	) {
		ctx.registerI18n('en', en);
		ctx.registerI18n('zh', zh);
		ctx.registerI18n('zh-TW', zhTW);
		ctx.registerI18n('ru', ru);
	}

	readonly start = () => {
		const finishUpload = ({ key }: { key: string }) => this.remoteFs?.finishUpload(key);
		this.cleanup.push(
			this.ctx.on('taskCompleted', finishUpload),
			this.ctx.on('taskFailed', finishUpload),
			this.ctx.on('syncCanceled', () => this.remoteFs?.cancelUploads()),
			this.ctx.registerRemoteFsWrapper({
				apply: (fs) => {
					if (this.ctx.settings.remoteFs !== 's3') return;
					const backend = digOriginal(fs);
					if (!backend.getUid().startsWith('s3~')) return;
					const wrapped = new RcloneFs(
						fs,
						!this.ctx.settings.asymmetricStorage,
						this.moduleSettings.ignoreEtags,
					);
					this.remoteFs = wrapped;
					return wrapped;
				},
				// Release upload memory before waiting for other files in the batch.
				priority: 2500,
			}),
			this.ctx.registerRemoteOptimizer({
				apply: ({ atoms, fs }): undefined => {
					const rclone = this.remoteFs;
					if (rclone && digOriginal(fs) === digOriginal(rclone.original))
						rclone.prepareUploads(atoms);
					// Continue to the backend optimizer, preserving S3 batch deletes.
				},
				priority: 500,
			}),
			this.ctx.registerSetting({
				apply: {
					604: {
						10_000: s(() => ({
							desc: this.ctx.translate('rcloneIgnoreEtagsDescription'),
							name: this.ctx.translate('rcloneIgnoreEtags'),
							render: (setting) => {
								setting.addToggle((toggle) =>
									toggle
										.setValue(this.moduleSettings.ignoreEtags)
										.onChange((value) => {
											this.moduleSettings.ignoreEtags = value;
											void this.ctx.saveSettings();
										}),
								);
							},
						})),
					},
				},
				priority: 605,
			}),
		);
	};

	readonly dispose = () => this.cleanup.splice(0).forEach((fn) => fn());
}
