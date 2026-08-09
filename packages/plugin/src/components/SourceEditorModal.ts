import { normalizeUrl } from '@repo/shared/path';
import { App, Modal, Notice, setIcon, Setting, setTooltip } from 'obsidian';
import type { Translate } from '@/modules/I18n';

export type SourceEditorTranslations = {
	add: string;
	cancel: string;
	editSources: string;
	omittedInvalidEntry: string;
	moduleSourcePlaceholder: string;
	remove: string;
	save: string;
	sourcesDescription: string;
	httpInsecureWarning: string;
};

export default class SourceEditorModal extends Modal {
	private readonly sources: Array<string>;
	private readonly t: Translate<SourceEditorTranslations>;

	constructor(
		private readonly onSave: (sources: Array<string>) => void,
		ctx: {
			app: App;
			translate: Translate<SourceEditorTranslations>;
		},
		sources: Array<string> = [],
	) {
		super(ctx.app);
		this.sources = structuredClone(sources);
		this.t = ctx.translate;
	}

	onOpen() {
		const { contentEl, sources, t } = this;
		contentEl.empty();

		this.setTitle(t('editSources'));
		contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: t('sourcesDescription'),
		});

		const listContainer = contentEl.createDiv('flex flex-col gap-2 pb-2');

		const updateList = () => {
			listContainer.empty();
			sources.forEach((source, index) => {
				const itemContainer = listContainer.createDiv('flex gap-2');
				const input = itemContainer.createEl('input', {
					cls: 'flex-1',
					placeholder: t('moduleSourcePlaceholder'),
					type: 'text',
					value: source,
				});
				input.spellcheck = false;
				input.addEventListener('input', () => (sources[index] = input.value));
				const trash = itemContainer.createEl(
					'button',
					'clickable-icon aspect-square color-[--color-red]',
				);
				setIcon(trash, 'trash-2');
				trash.onClickEvent(() => {
					sources.splice(index, 1);
					updateList();
				});
			});
		};
		updateList();
		const add = contentEl.createEl('button', 'clickable-icon aspect-square ml-auto mb-2');
		setIcon(add, 'plus');
		setTooltip(add, t('add'));
		add.onClickEvent(() => {
			sources.push('');
			updateList();
		});

		new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText(t('cancel')).onClick(this.close.bind(this));
			})
			.addButton((button) => {
				button
					.setButtonText(t('save'))
					.setCta()
					.onClick(() => {
						const validSources: Array<string> = [];
						sources.forEach((source) => {
							const normalizedSource = processSource(
								source,
								t('httpInsecureWarning'),
							);
							if (!normalizedSource) return;
							validSources.push(normalizedSource);
						});
						this.onSave(validSources);
						if (validSources.length !== sources.length)
							new Notice(
								t('omittedInvalidEntry', {
									count: sources.length - validSources.length,
								}),
							);
						this.close();
					});
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

function processSource(source: string, warning: string): string | false {
	try {
		const { protocol } = new URL(source);
		if (protocol === 'http:') new Notice(warning);
		if (protocol !== 'http:' && protocol !== 'https:') return false;
		return normalizeUrl(source);
	} catch {
		return false;
	}
}
