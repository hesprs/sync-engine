import { Modal } from 'obsidian';
import type { HistoryTranslations } from './i18n';
import type { Translate } from '@hesprs/sync-engine-sdk';
import type { App } from 'obsidian';

function text(value: unknown): string {
	return typeof value === 'string' ? value : String(value);
}

/** Modal to select and recover deleted notes. */
export default class RecoverDeletedModal extends Modal {
	constructor(
		private readonly ctx: { app: App; translate: Translate<HistoryTranslations> },
		private readonly deletedKeys: Array<string>,
		private readonly onSelect: (key: string) => void,
	) {
		super(ctx.app);
		this.setTitle(text(ctx.translate('recoverDeletedTitle')));
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.style.display = 'flex';
		contentEl.style.flexDirection = 'column';
		contentEl.style.gap = '12px';
		if (this.deletedKeys.length === 0) {
			contentEl.createEl('p', { text: text(this.ctx.translate('noDeletedNotes')) });
			return;
		}
		const list = contentEl.createEl('div');
		list.style.display = 'flex';
		list.style.flexDirection = 'column';
		list.style.gap = '6px';
		list.style.maxHeight = '60vh';
		list.style.overflowY = 'auto';
		list.style.paddingRight = '4px';

		for (const key of this.deletedKeys) {
			const item = list.createEl('button', { text: key });
			item.style.width = '100%';
			item.style.textAlign = 'left';
			item.style.padding = '8px 12px';
			item.style.borderRadius = '4px';
			item.style.fontSize = '13px';
			item.style.cursor = 'pointer';
			item.style.border = '1px solid var(--background-modifier-border)';
			item.style.backgroundColor = 'var(--background-secondary)';
			item.style.color = 'var(--text-normal)';
			item.addEventListener('click', () => {
				this.close();
				this.onSelect(key);
			});
		}
	}
}
