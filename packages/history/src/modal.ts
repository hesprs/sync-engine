import Onp from '@repo/shared/onp';
import { Modal, Notice, Setting } from 'obsidian';
import type { HistoryTranslations } from '@/i18n';
import type { VersionSummary } from '@/types';
import type { Translate } from '@hesprs/sync-engine-sdk';
import type { App, ButtonComponent, TFile } from 'obsidian';

export type HistoryModalActions = {
	load: (key: string, lamport: number) => Promise<string>;
	restore: (text: string) => Promise<void>;
};

export type DiffLine = { text: string; type: 'added' | 'removed' | 'unchanged' };

export function computeLineDiff(historical: string, current: string): Array<DiffLine> {
	const a = historical.split('\n');
	const b = current.split('\n');
	const hunks = new Onp(a, b).compose();
	const lines: Array<DiffLine> = [];
	let curA = 0;
	let curB = 0;
	for (const hunk of hunks) {
		const [startA, lenA] = hunk.file1;
		const [startB, lenB] = hunk.file2;
		while (curA < startA && curB < startB) {
			lines.push({ text: a[curA], type: 'unchanged' });
			curA++;
			curB++;
		}
		for (let i = 0; i < lenA; i++) lines.push({ text: a[startA + i], type: 'removed' });
		for (let i = 0; i < lenB; i++) lines.push({ text: b[startB + i], type: 'added' });
		curA = startA + lenA;
		curB = startB + lenB;
	}
	while (curA < a.length && curB < b.length) {
		lines.push({ text: a[curA], type: 'unchanged' });
		curA++;
		curB++;
	}
	return lines;
}

/** Translate returns DocumentFragment for function-valued keys; our translations yield strings. */
function text(value: unknown): string {
	return typeof value === 'string' ? value : String(value);
}

/** Per-file history browser: a timestamp list, a visual diff / preview, and a confirmed restore. */
export default class HistoryModal extends Modal {
	private selected?: VersionSummary;
	private selectedText = '';
	private currentText = '';
	private viewMode: 'diff' | 'full' = 'diff';
	private previewEl?: HTMLElement;
	private confirmationEl?: HTMLElement;
	private restoreButton?: ButtonComponent;
	private fullBtn?: HTMLButtonElement;
	private diffBtn?: HTMLButtonElement;
	private diffStatsEl?: HTMLElement;
	private listEl?: HTMLElement;
	private confirming = false;

	constructor(
		private readonly ctx: { app: App; translate: Translate<HistoryTranslations> },
		private readonly file: TFile | { path: string },
		private readonly versions: Array<VersionSummary>,
		private readonly actions: HistoryModalActions,
	) {
		super(ctx.app);
		this.setTitle(text(ctx.translate('historyTitle', file.path)));
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.style.display = 'flex';
		contentEl.style.flexDirection = 'column';
		contentEl.style.gap = '12px';
		contentEl.style.minHeight = '420px';

		const abstractFile = this.ctx.app.vault.getAbstractFileByPath(this.file.path);
		if (abstractFile && 'read' in abstractFile)
			void this.ctx.app.vault.read(abstractFile as unknown as TFile).then((current) => {
				this.currentText = current;
				if (this.selected) this.renderPreview();
			});

		if (this.versions.length === 0) {
			contentEl.createEl('p', { text: text(this.ctx.translate('noVersions')) });
			return;
		}

		const layout = contentEl.createEl('div');
		layout.style.display = 'flex';
		layout.style.flex = '1';
		layout.style.gap = '16px';
		layout.style.minHeight = '300px';

		const list = layout.createEl('div');
		this.listEl = list;
		list.style.display = 'flex';
		list.style.flexDirection = 'column';
		list.style.gap = '6px';
		list.style.width = '220px';
		list.style.flexShrink = '0';
		list.style.overflowY = 'auto';
		list.style.maxHeight = '55vh';
		list.style.paddingRight = '4px';

		const previewWrap = layout.createEl('div');
		previewWrap.style.display = 'flex';
		previewWrap.style.flexDirection = 'column';
		previewWrap.style.flex = '1';
		previewWrap.style.minWidth = '0';

		const toolbar = previewWrap.createEl('div');
		toolbar.style.display = 'flex';
		toolbar.style.alignItems = 'center';
		toolbar.style.gap = '8px';
		toolbar.style.marginBottom = '8px';

		this.diffBtn = toolbar.createEl('button', { text: text(this.ctx.translate('viewDiff')) });
		this.fullBtn = toolbar.createEl('button', { text: text(this.ctx.translate('viewFull')) });
		this.diffStatsEl = toolbar.createEl('div');
		this.diffStatsEl.style.fontSize = '12px';
		this.diffStatsEl.style.marginLeft = 'auto';
		this.diffStatsEl.style.fontFamily = 'var(--font-monospace, monospace)';

		this.updateToolbarButtons();

		this.diffBtn.addEventListener('click', () => {
			this.viewMode = 'diff';
			this.updateToolbarButtons();
			this.renderPreview();
		});
		this.fullBtn.addEventListener('click', () => {
			this.viewMode = 'full';
			this.updateToolbarButtons();
			this.renderPreview();
		});

		this.previewEl = previewWrap.createEl('div');
		this.previewEl.style.flex = '1';
		this.previewEl.style.minHeight = '240px';
		this.previewEl.style.maxHeight = '55vh';
		this.previewEl.style.overflow = 'auto';
		this.previewEl.style.border = '1px solid var(--background-modifier-border)';
		this.previewEl.style.borderRadius = '6px';
		this.previewEl.style.backgroundColor = 'var(--background-primary)';
		this.previewEl.style.padding = '8px 0';
		this.previewEl.setText(text(this.ctx.translate('previewHint')));

		let firstItem: HTMLButtonElement | undefined;
		for (const version of this.versions) {
			const item = list.createEl('button');
			item.style.width = '100%';
			item.style.textAlign = 'left';
			item.style.padding = '8px 12px';
			item.style.borderRadius = '6px';
			item.style.fontSize = '13px';
			item.style.cursor = 'pointer';
			item.style.border = '1px solid var(--background-modifier-border)';
			item.style.backgroundColor = 'var(--background-secondary)';
			item.style.color = 'var(--text-normal)';

			item.createSpan({ text: this.label(version) });
			if (version.lamport === this.versions[0]?.lamport) {
				const badge = item.createSpan({
					text: ` ${text(this.ctx.translate('currentVersionBadge'))}`,
				});
				badge.style.fontSize = '11px';
				badge.style.color = 'var(--interactive-accent)';
				badge.style.fontWeight = 'normal';
			}

			item.addEventListener('click', () => void this.select(version, item, list));
			firstItem ??= item;
		}

		this.confirmationEl = contentEl.createEl('div');
		this.confirmationEl.style.display = 'none';
		this.confirmationEl.style.padding = '8px 12px';
		this.confirmationEl.style.borderRadius = '4px';
		this.confirmationEl.style.backgroundColor =
			'var(--background-modifier-error, rgba(248, 81, 73, 0.15))';
		this.confirmationEl.style.color = 'var(--text-error, #f85149)';
		this.confirmationEl.style.border = '1px solid var(--text-error, #f85149)';
		this.confirmationEl.style.fontSize = '13px';

		const actions = new Setting(contentEl).setClass('border-none');
		actions.addButton((button) =>
			button.setButtonText(text(this.ctx.translate('cancel'))).onClick(() => {
				if (this.confirming) this.resetConfirmation();
				else this.close();
			}),
		);
		actions.addButton((button) => {
			button
				.setButtonText(text(this.ctx.translate('restore')))
				.setCta()
				.setDisabled(true);
			button.onClick(() => void this.onRestoreClick());
			this.restoreButton = button;
		});

		const newest = this.versions[0];
		if (newest && firstItem) void this.select(newest, firstItem, list);
	}

	private updateToolbarButtons(): void {
		const isDiff = this.viewMode === 'diff';
		const applyBtnStyle = (btn: HTMLButtonElement | undefined, active: boolean) => {
			if (!btn) return;
			btn.style.padding = '4px 12px';
			btn.style.fontSize = '12px';
			btn.style.borderRadius = '4px';
			btn.style.cursor = 'pointer';
			btn.style.border = '1px solid var(--background-modifier-border)';
			if (active) {
				btn.style.backgroundColor = 'var(--interactive-accent)';
				btn.style.color = 'var(--text-on-accent)';
				btn.style.borderColor = 'var(--interactive-accent)';
			} else {
				btn.style.backgroundColor = 'var(--background-secondary)';
				btn.style.color = 'var(--text-muted)';
			}
		};
		applyBtnStyle(this.diffBtn, isDiff);
		applyBtnStyle(this.fullBtn, !isDiff);
	}

	private label(version: VersionSummary): string {
		return text(this.ctx.translate('version', { at: version.at }));
	}

	private renderPreview(): void {
		if (!this.previewEl) return;
		this.previewEl.empty();
		if (!this.selectedText && !this.selected) {
			if (this.diffStatsEl) this.diffStatsEl.empty();
			this.previewEl.setText(text(this.ctx.translate('previewHint')));
			return;
		}
		if (this.viewMode === 'full') {
			if (this.diffStatsEl) this.diffStatsEl.empty();
			const pre = this.previewEl.createEl('pre');
			pre.style.margin = '0';
			pre.style.padding = '10px 14px';
			pre.style.whiteSpace = 'pre-wrap';
			pre.style.wordBreak = 'break-word';
			pre.style.fontFamily = 'var(--font-monospace, monospace)';
			pre.style.fontSize = '12px';
			pre.style.lineHeight = '1.6';
			pre.style.color = 'var(--text-normal)';
			pre.setText(this.selectedText || '(empty note)');
			return;
		}

		const diffLines = computeLineDiff(this.selectedText, this.currentText);
		let addedCount = 0;
		let removedCount = 0;
		for (const line of diffLines)
			if (line.type === 'added') addedCount++;
			else if (line.type === 'removed') removedCount++;
		if (this.diffStatsEl) {
			this.diffStatsEl.empty();
			const addSpan = this.diffStatsEl.createSpan({ text: `+${addedCount}` });
			addSpan.style.color = 'var(--text-success, #2ea043)';
			addSpan.style.fontWeight = 'bold';
			addSpan.style.marginRight = '8px';
			const remSpan = this.diffStatsEl.createSpan({ text: `-${removedCount}` });
			remSpan.style.color = 'var(--text-error, #f85149)';
			remSpan.style.fontWeight = 'bold';
		}

		for (const line of diffLines) {
			const row = this.previewEl.createEl('div');
			row.style.display = 'flex';
			row.style.alignItems = 'flex-start';
			row.style.padding = '2px 10px';
			row.style.fontFamily = 'var(--font-monospace, monospace)';
			row.style.fontSize = '12px';
			row.style.lineHeight = '1.6';
			row.style.whiteSpace = 'pre-wrap';
			row.style.wordBreak = 'break-word';

			const sign = row.createSpan();
			sign.style.width = '18px';
			sign.style.flexShrink = '0';
			sign.style.userSelect = 'none';
			sign.style.fontWeight = 'bold';

			const textSpan = row.createSpan();
			textSpan.style.flex = '1';
			textSpan.style.whiteSpace = 'pre-wrap';
			textSpan.style.wordBreak = 'break-word';
			textSpan.setText(line.text);

			if (line.type === 'added') {
				row.style.backgroundColor =
					'var(--background-modifier-success, rgba(46, 160, 67, 0.18))';
				row.style.borderLeft = '3px solid var(--text-success, #2ea043)';
				sign.style.color = 'var(--text-success, #2ea043)';
				sign.setText('+');
				textSpan.style.color = 'var(--text-success, #2ea043)';
			} else if (line.type === 'removed') {
				row.style.backgroundColor =
					'var(--background-modifier-error, rgba(248, 81, 73, 0.18))';
				row.style.borderLeft = '3px solid var(--text-error, #f85149)';
				sign.style.color = 'var(--text-error, #f85149)';
				sign.setText('-');
				textSpan.style.color = 'var(--text-error, #f85149)';
			} else {
				row.style.backgroundColor = 'transparent';
				row.style.borderLeft = '3px solid transparent';
				sign.style.color = 'var(--text-muted, #8b949e)';
				sign.setText(' ');
				textSpan.style.color = 'var(--text-normal)';
			}
		}
	}

	private async select(
		version: VersionSummary,
		item: HTMLButtonElement,
		list: HTMLElement,
	): Promise<void> {
		this.selected = version;
		this.selectedText = '';
		this.resetConfirmation();
		for (const child of list.children) {
			const btn = child as HTMLElement;
			btn.style.backgroundColor = 'var(--background-secondary)';
			btn.style.borderColor = 'var(--background-modifier-border)';
			btn.style.fontWeight = 'normal';
		}
		item.style.backgroundColor = 'var(--background-modifier-hover)';
		item.style.borderColor = 'var(--interactive-accent)';
		item.style.fontWeight = 'bold';

		if (this.previewEl) {
			this.previewEl.empty();
			this.previewEl.setText(text(this.ctx.translate('previewHint')));
		}
		if (this.restoreButton) this.restoreButton.setDisabled(true);
		try {
			const loaded = await this.actions.load(this.file.path, version.lamport);
			this.selectedText = loaded;
			this.renderPreview();
			if (this.restoreButton) this.restoreButton.setDisabled(false);
		} catch (error) {
			const message = text(this.ctx.translate('loadFailed', String(error)));
			if (this.previewEl) {
				this.previewEl.empty();
				this.previewEl.setText(message);
			}
			new Notice(message);
		}
	}

	private async onRestoreClick(): Promise<void> {
		if (!this.selected || !this.restoreButton) return;
		const label = this.label(this.selected);
		if (!this.confirming) {
			this.confirming = true;
			if (this.confirmationEl) {
				this.confirmationEl.textContent = text(this.ctx.translate('confirmRestore', label));
				this.confirmationEl.style.display = 'block';
			}
			this.restoreButton.setButtonText(text(this.ctx.translate('confirmRestoreButton')));
			return;
		}
		try {
			await this.actions.restore(this.selectedText);
			new Notice(text(this.ctx.translate('restored', label)));
			this.close();
		} catch (error) {
			new Notice(text(this.ctx.translate('restoreFailed', String(error))));
			this.resetConfirmation();
		}
	}

	private resetConfirmation(): void {
		this.confirming = false;
		if (this.confirmationEl) {
			this.confirmationEl.style.display = 'none';
			this.confirmationEl.textContent = '';
		}
		if (this.restoreButton)
			this.restoreButton.setButtonText(text(this.ctx.translate('restore')));
	}
}

/** Modal to select and recover deleted notes. */
export class RecoverDeletedModal extends Modal {
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
