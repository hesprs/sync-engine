import { basename } from '@repo/shared/path';
import { App, Modal, Setting } from 'obsidian';
import type { Fragment, Translate } from '@/modules/I18n';
import type { AugmentedModuleMeta, MaybePromise } from '@/sdk';
import formatDateTime from '@/utils/format-date';
import { formatFileSize } from '@/utils/unit-converter';
import ModuleEditorModal from './ModuleEditorModal';

type FileInfo = { path: string; size: string; mtime: string; ctime: string; fileName: string };

export type UnknownModuleTranslations = {
	unknownModule: string;
	unknownModuleDescription: Fragment<FileInfo>;
	delete: string;
	configure: string;
};

export default class UnknownModuleModal extends Modal {
	private cachedInfo?: FileInfo;

	constructor(
		private readonly ctx: { app: App; translate: Translate<UnknownModuleTranslations> },
		private readonly options: {
			onSave: (meta: AugmentedModuleMeta) => MaybePromise<void>;
			path: string;
			id: string;
		},
	) {
		super(ctx.app);
	}

	onOpen() {
		const { translate, app } = this.ctx;
		const { id, path, onSave } = this.options;
		this.setTitle(translate('unknownModule'));
		this.contentEl.addClass('markdown-rendered');

		const content = this.contentEl.createDiv();
		if (this.cachedInfo) content.append(translate('unknownModuleDescription', this.cachedInfo));
		else
			void app.vault.adapter.stat(path).then((stat) => {
				if (!stat) {
					this.close();
					return;
				}
				const { ctime, mtime, size } = stat;
				const fileInfo: FileInfo = {
					ctime: formatDateTime(ctime),
					fileName: basename(path),
					mtime: formatDateTime(mtime),
					path,
					size: formatFileSize(size),
				};
				this.cachedInfo = fileInfo;
				content.append(translate('unknownModuleDescription', fileInfo));
			});

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(translate('configure')).onClick(() => {
					new ModuleEditorModal(this.ctx, {
						getFile: () => app.vault.adapter.read(path),
						initial: {
							description: '',
							enabled: false,
							icon: 'puzzle',
							id,
							integrity: '<placeholder>',
							main: '',
							name: 'Unknown Module',
							source: '',
							version: '0.0.1',
						},
						onCancel: () => this.open(),
						onSave,
					}).open();
					this.close();
				}),
			)
			.addButton((button) =>
				button
					.setButtonText(translate('delete'))
					.setDestructive()
					.setCta()
					.onClick(async () => {
						await app.vault.adapter.remove(path);
						this.close();
					}),
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
