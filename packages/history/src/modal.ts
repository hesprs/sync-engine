import { computeLineDiff, renderDiffLines } from './diff';
import { createMobileRoller } from './roller';
import { Modal, Notice, Platform, Setting, TFile } from 'obsidian';
import type { HistoryTranslations } from './i18n';
import type { MobileRoller } from './roller';
import type { VersionSummary } from './types';
import type { Translate } from '@hesprs/sync-engine-sdk';
import type { App, ButtonComponent } from 'obsidian';

export { computeLineDiff, type DiffLine } from './diff';
export { default as RecoverDeletedModal } from './recover-deleted-modal';

export type HistoryModalActions = {
	currentText?: string;
	isBinary?: boolean;
	load: (key: string, lamport: number) => Promise<{ binary?: Uint8Array; text: string }>;
	restore: (text: string, binary?: Uint8Array) => Promise<void>;
};

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Translate returns DocumentFragment for function-valued keys; our translations yield strings. */
function text(value: unknown): string {
	return typeof value === 'string' ? value : String(value);
}

/** Per-file history browser: a timestamp list, a visual diff / preview, and a confirmed restore. */
export default class HistoryModal extends Modal {
	private selected?: VersionSummary;
	private selectedText = '';
	private selectedBinary?: Uint8Array;
	private objectUrl?: string;
	private currentText = '';
	private viewMode: 'diff' | 'full' = 'diff';
	private previewEl?: HTMLElement;
	private confirmationEl?: HTMLElement;
	private restoreButton?: ButtonComponent;
	private fullBtn?: HTMLButtonElement;
	private diffBtn?: HTMLButtonElement;
	private diffStatsEl?: HTMLElement;
	private listEl?: HTMLElement;
	private mobileRoller?: MobileRoller;
	private confirming = false;

	constructor(
		private readonly ctx: { app: App; translate: Translate<HistoryTranslations> },
		private readonly file: TFile | { path: string },
		private readonly versions: Array<VersionSummary>,
		private readonly actions: HistoryModalActions,
	) {
		super(ctx.app);
		this.setTitle(text(ctx.translate('historyTitle', file.path)));
		if (actions.currentText !== undefined) this.currentText = actions.currentText;
		if (actions.isBinary) this.viewMode = 'full';
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.style.display = 'flex';
		contentEl.style.flexDirection = 'column';
		contentEl.style.gap = '12px';
		contentEl.style.minHeight = Platform.isMobile ? '0' : '420px';

		if (!this.currentText) {
			const abstractFile = this.ctx.app.vault.getAbstractFileByPath(this.file.path);
			if (abstractFile instanceof TFile)
				void this.ctx.app.vault.read(abstractFile).then((current) => {
					this.currentText = current;
					if (this.selected) this.renderPreview();
				});
		}

		if (this.versions.length === 0) {
			contentEl.createEl('p', { text: text(this.ctx.translate('noVersions')) });
			return;
		}

		let previewWrap: HTMLElement;
		let firstItem: HTMLButtonElement | undefined;
		const isMobile = Platform.isMobile;

		if (isMobile) {
			previewWrap = contentEl.createEl('div');
			previewWrap.style.display = 'flex';
			previewWrap.style.flexDirection = 'column';
			previewWrap.style.flex = '1';
			previewWrap.style.minWidth = '0';
			previewWrap.style.minHeight = '0';
		} else {
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

			previewWrap = layout.createEl('div');
			previewWrap.style.display = 'flex';
			previewWrap.style.flexDirection = 'column';
			previewWrap.style.flex = '1';
			previewWrap.style.minWidth = '0';
		}

		const toolbar = previewWrap.createEl('div');
		toolbar.style.display = 'flex';
		toolbar.style.alignItems = 'center';
		toolbar.style.gap = '8px';
		toolbar.style.marginBottom = '8px';

		if (isMobile)
			this.mobileRoller = createMobileRoller({
				container: toolbar,
				currentBadgeText: text(this.ctx.translate('currentVersionBadge')),
				label: (v) => this.label(v),
				onSelect: (target) => void this.select(target),
				onStep: (delta) => void this.stepVersion(delta),
				versions: this.versions,
			});

		if (!this.actions.isBinary) {
			const btnGroup = isMobile ? toolbar.createEl('div') : toolbar;
			if (isMobile) {
				btnGroup.style.display = 'flex';
				btnGroup.style.borderRadius = '6px';
				btnGroup.style.overflow = 'hidden';
				btnGroup.style.border = '1px solid var(--background-modifier-border)';
				btnGroup.style.flexShrink = '0';
			}

			this.diffBtn = btnGroup.createEl('button', {
				text: text(this.ctx.translate(isMobile ? 'viewDiffShort' : 'viewDiff')),
			});
			this.fullBtn = btnGroup.createEl('button', {
				text: text(this.ctx.translate(isMobile ? 'viewFullShort' : 'viewFull')),
			});

			this.diffStatsEl = toolbar.createEl('div');
			this.diffStatsEl.style.fontSize = '12px';
			this.diffStatsEl.style.marginLeft = isMobile ? '0' : 'auto';
			this.diffStatsEl.style.fontFamily = 'var(--font-monospace, monospace)';
			this.diffStatsEl.style.flexShrink = '0';

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
		}

		this.previewEl = previewWrap.createEl('div');
		this.previewEl.style.flex = '1';
		this.previewEl.style.minHeight = isMobile ? '0' : '240px';
		this.previewEl.style.maxHeight = isMobile ? 'none' : '55vh';
		this.previewEl.style.overflow = 'auto';
		this.previewEl.style.border = '1px solid var(--background-modifier-border)';
		this.previewEl.style.borderRadius = '6px';
		this.previewEl.style.backgroundColor = 'var(--background-primary)';
		this.previewEl.style.padding = '8px 0';
		this.previewEl.setText(
			text(this.ctx.translate(isMobile ? 'previewHintMobile' : 'previewHint')),
		);

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
		if (newest) void this.select(newest, firstItem, this.listEl);
	}

	private updateToolbarButtons(): void {
		const isDiff = this.viewMode === 'diff';
		const isMobile = Platform.isMobile;
		const applyBtnStyle = (btn: HTMLButtonElement | undefined, active: boolean) => {
			if (!btn) return;
			btn.style.padding = isMobile ? '0 10px' : '4px 12px';
			btn.style.height = isMobile ? '32px' : 'auto';
			btn.style.fontSize = '12px';
			btn.style.borderRadius = isMobile ? '0' : '4px';
			btn.style.cursor = 'pointer';
			btn.style.border = isMobile ? 'none' : '1px solid var(--background-modifier-border)';
			if (active) {
				btn.style.backgroundColor = 'var(--interactive-accent)';
				btn.style.color = 'var(--text-on-accent)';
				if (!isMobile) btn.style.borderColor = 'var(--interactive-accent)';
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

	onClose(): void {
		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = undefined;
		}
	}

	private renderPreview(): void {
		if (!this.previewEl) return;
		this.previewEl.empty();
		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = undefined;
		}
		if (!this.selectedText && !this.selectedBinary && !this.selected) {
			if (this.diffStatsEl) this.diffStatsEl.empty();
			this.previewEl.setText(
				text(this.ctx.translate(Platform.isMobile ? 'previewHintMobile' : 'previewHint')),
			);
			return;
		}

		if (this.selectedBinary) {
			if (this.diffStatsEl) this.diffStatsEl.empty();
			const wrap = this.previewEl.createEl('div');
			wrap.style.display = 'flex';
			wrap.style.flexDirection = 'column';
			wrap.style.alignItems = 'center';
			wrap.style.justifyContent = 'center';
			wrap.style.padding = '16px';
			wrap.style.gap = '12px';

			const ext = this.file.path.split('.').pop()?.toLowerCase() ?? '';
			const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']);
			const audioExts = new Set(['mp3', 'wav', 'm4a', 'ogg']);

			const sizeLabel = formatBytes(this.selectedBinary.byteLength);
			const info = wrap.createEl('div');
			info.style.fontSize = '12px';
			info.style.color = 'var(--text-muted)';
			info.style.fontFamily = 'var(--font-monospace, monospace)';
			info.setText(`${ext ? `.${ext.toUpperCase()}` : 'Binary'} • ${sizeLabel}`);

			if (imageExts.has(ext)) {
				const mime =
					ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
				const blob = new Blob([this.selectedBinary.buffer as ArrayBuffer], { type: mime });
				this.objectUrl = URL.createObjectURL(blob);
				const img = wrap.createEl('img');
				img.src = this.objectUrl;
				img.style.maxWidth = '100%';
				img.style.maxHeight = '40vh';
				img.style.objectFit = 'contain';
				img.style.borderRadius = '4px';
				img.style.border = '1px solid var(--background-modifier-border)';
			} else if (audioExts.has(ext)) {
				const blob = new Blob([this.selectedBinary.buffer as ArrayBuffer]);
				this.objectUrl = URL.createObjectURL(blob);
				const audio = wrap.createEl('audio');
				audio.src = this.objectUrl;
				audio.controls = true;
			}
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

		renderDiffLines(this.previewEl, diffLines);
	}

	private async select(
		version: VersionSummary,
		item?: HTMLButtonElement,
		list?: HTMLElement,
	): Promise<void> {
		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = undefined;
		}
		this.selected = version;
		this.selectedText = '';
		this.selectedBinary = undefined;
		this.resetConfirmation();
		const listContainer = list ?? this.listEl;
		const index = this.versions.findIndex((v) => v.lamport === version.lamport);
		if (listContainer)
			for (const [idx, child] of [...listContainer.children].entries()) {
				const btn = child as HTMLElement;
				const isCurrent = idx === index;
				btn.style.backgroundColor = isCurrent
					? 'var(--background-modifier-hover)'
					: 'var(--background-secondary)';
				btn.style.borderColor = isCurrent
					? 'var(--interactive-accent)'
					: 'var(--background-modifier-border)';
				btn.style.fontWeight = isCurrent ? 'bold' : 'normal';
			}

		if (item) {
			item.style.backgroundColor = 'var(--background-modifier-hover)';
			item.style.borderColor = 'var(--interactive-accent)';
			item.style.fontWeight = 'bold';
		}
		if (this.mobileRoller) this.mobileRoller.update(version, index);

		if (this.previewEl) {
			this.previewEl.empty();
			this.previewEl.setText(
				text(this.ctx.translate(Platform.isMobile ? 'previewHintMobile' : 'previewHint')),
			);
		}
		if (this.restoreButton) this.restoreButton.setDisabled(true);
		try {
			const loaded = await this.actions.load(this.file.path, version.lamport);
			this.selectedText = loaded.text;
			this.selectedBinary = loaded.binary;
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

	private async stepVersion(delta: number): Promise<void> {
		if (!this.selected) return;
		const currentIndex = this.versions.findIndex((v) => v.lamport === this.selected?.lamport);
		if (currentIndex === -1) return;
		const nextIndex = currentIndex + delta;
		if (nextIndex < 0 || nextIndex >= this.versions.length) return;
		const target = this.versions[nextIndex];
		if (target) await this.select(target);
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
			await this.actions.restore(this.selectedText, this.selectedBinary);
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
