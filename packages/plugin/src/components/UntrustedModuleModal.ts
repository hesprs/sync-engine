import { basename } from '@repo/shared/path';
import { App, Modal, Setting } from 'obsidian';
import type { AugmentedModuleMeta } from '@/modules/Extensibility';
import type { Fragment, Translate } from '@/modules/I18n';
import type { MaybePromise } from '@/types';
import formatDateTime from '@/utils/format-date';
import { formatFileSize } from '@/utils/unit-converter';
import ModuleEditorModal from './ModuleEditorModal';

type FileInfo = { path: string; size: string; mtime: string; ctime: string; fileName: string };

export type UntrustedModuleTranslations = {
	untrustedModule: string;
	untrustedModuleDescription: Fragment<FileInfo>;
	delete: string;
	configure: string;
};

export default class UnknownModuleModal extends Modal {
	private cachedInfo?: FileInfo;

	constructor(
		private readonly ctx: { app: App; translate: Translate<UntrustedModuleTranslations> },
		private readonly options: {
			onSave: (meta: AugmentedModuleMeta) => MaybePromise<void>;
			path: string;
			id: string;
		},
	) {
		super(ctx.app);
		this.setTitle(ctx.translate('untrustedModule'));
		this.contentEl.addClass('markdown-rendered');
	}

	onOpen() {
		const { translate, app } = this.ctx;
		const { id, path, onSave } = this.options;

		const content = this.contentEl.createDiv();
		if (this.cachedInfo)
			content.append(translate('untrustedModuleDescription', this.cachedInfo));
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
				content.append(translate('untrustedModuleDescription', fileInfo));
			});

		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText(translate('delete'))
					.setDestructive()
					.onClick(async () => {
						await app.vault.adapter.remove(path);
						this.close();
					}),
			)
			.addButton((button) =>
				button
					.setButtonText(translate('configure'))
					.setCta()
					.onClick(async () => {
						new ModuleEditorModal(this.ctx, {
							file: await app.vault.adapter.read(path),
							initial: { id },
							onCancel: () => this.open(),
							onSave,
						}).open();
						this.close();
					}),
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
