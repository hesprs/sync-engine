import { App, Modal, setIcon, Setting, setTooltip } from 'obsidian';
import type { Fragment, Translate } from '@/modules/I18n';
import type { GlobMatchRule } from '@/types';

type FilterType = 'include' | 'exclude';

export type FilterEditorTranslations = {
	cancel: string;
	remove: string;
	save: string;
	add: string;
	inclusionRules: string;
	exclusionRules: string;
	inclusionRulesDescription: Fragment;
	exclusionRulesDescription: Fragment;
	filterPlaceholder: string;
};

export default class FilterEditorModal extends Modal {
	private readonly filters: Array<GlobMatchRule>;
	private readonly t: Translate<FilterEditorTranslations>;

	constructor(
		private readonly onSave: (filters: Array<GlobMatchRule>) => void,
		private readonly filterType: FilterType,
		ctx: {
			app: App;
			translate: Translate<FilterEditorTranslations>;
		},
		filters: Array<GlobMatchRule> = [],
	) {
		super(ctx.app);
		this.contentEl.addClass('markdown-rendered');
		this.filters = structuredClone(filters);
		this.t = ctx.translate;
	}

	onOpen() {
		const { contentEl, filterType, t, filters } = this;
		contentEl.empty();

		const titleKey = filterType === 'include' ? 'inclusionRules' : 'exclusionRules';
		const descKey =
			filterType === 'include' ? 'inclusionRulesDescription' : 'exclusionRulesDescription';

		this.setTitle(t(titleKey));
		contentEl.createEl('p', { cls: 'setting-item-description', text: t(descKey) });

		const listContainer = contentEl.createDiv('flex flex-col gap-2 pb-2');
		const updateList = () => {
			listContainer.empty();
			filters.forEach((filter, index) => {
				const itemContainer = listContainer.createDiv('flex gap-2');
				const input = itemContainer.createEl('input', {
					cls: 'flex-1',
					placeholder: t('filterPlaceholder'),
					type: 'text',
					value: filter.expr,
				});
				input.spellcheck = false;
				input.addEventListener('input', () => {
					filter.expr = input.value;
					filters[index] = filter;
				});
				const forceCaseBtn = itemContainer.createEl(
					'button',
					'clickable-icon aspect-square',
				);
				setIcon(forceCaseBtn, 'case-sensitive');
				function updateButtonStatus() {
					const activeClasses = [
						'bg-[--interactive-accent]!',
						'color-[--text-on-accent]!',
					];
					if (filter.caseSensitive) forceCaseBtn.addClasses(activeClasses);
					else forceCaseBtn.removeClasses(activeClasses);
				}
				updateButtonStatus();
				forceCaseBtn.onClickEvent(() => {
					filter.caseSensitive = !filter.caseSensitive;
					updateButtonStatus();
				});
				const trash = itemContainer.createEl(
					'button',
					'clickable-icon aspect-square color-[--color-red]',
				);
				setIcon(trash, 'trash-2');
				trash.onClickEvent(() => {
					filters.splice(index, 1);
					updateList();
				});
			});
		};
		updateList();
		const add = contentEl.createEl('button', 'clickable-icon aspect-square ml-auto mb-2');
		setIcon(add, 'plus');
		setTooltip(add, t('add'));
		add.onClickEvent(() => {
			filters.push({ caseSensitive: false, expr: '' });
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
						this.onSave(filters);
						this.close();
					});
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
