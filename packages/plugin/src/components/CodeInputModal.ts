import { App, Modal, Setting } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import type { MaybePromise } from '@/types';

export type CodeInputTranslations = {
	confirm: string;
	cancel: string;
	writeCode: string;
	writeCodeDescription: string;
};

export default class CodeInputModal extends Modal {
	constructor(
		private readonly ctx: { app: App; translate: Translate<CodeInputTranslations> },
		private readonly onSave: (code: string) => MaybePromise<void>,
	) {
		super(ctx.app);
		this.setTitle(ctx.translate('writeCode'));
	}

	onOpen() {
		const { translate } = this.ctx;
		const area = this.contentEl.createEl('textarea', {
			attr: { placeholder: translate('writeCodeDescription') },
			cls: 'se-min-h-25vh se-w-100% se-mb-3 se-resize-y',
		});
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(translate('cancel')).onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText(translate('confirm'))
					.setCta()
					.onClick(async () => {
						await this.onSave(area.value);
						this.close();
					}),
			);
	}
}
