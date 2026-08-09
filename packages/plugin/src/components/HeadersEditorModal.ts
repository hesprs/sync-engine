import { App, Modal, Notice, SecretComponent, setIcon, Setting, setTooltip } from 'obsidian';
import type { CustomHeaders } from '@/modules/Bootstrap';
import type { Translate } from '@/modules/I18n';

export type HeadersEditorTranslations = {
	add: string;
	cancel: string;
	addSecretHeader: string;
	remove: string;
	save: string;
	customHeadersDescription: string;
	editHeaders: string;
	headerKeyPlaceholder: string;
	headerValuePlaceholder: string;
	omittedInvalidEntry: string;
};

export default class HeadersEditorModal extends Modal {
	private readonly headers: CustomHeaders;

	constructor(
		private readonly onSave: (headers: CustomHeaders) => void,
		private readonly ctx: {
			app: App;
			translate: Translate<HeadersEditorTranslations>;
		},
		headers: CustomHeaders,
	) {
		super(ctx.app);
		this.headers = structuredClone(headers);
	}

	onOpen() {
		const {
			contentEl,
			headers,
			ctx: { translate: t, app },
		} = this;
		contentEl.empty();

		this.setTitle(t('editHeaders'));
		contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: t('customHeadersDescription'),
		});

		const listContainer = contentEl.createDiv('flex flex-col gap-2 pb-2');

		const updateList = () => {
			listContainer.empty();
			headers.forEach((header, index) => {
				const { key, type, value } = header;
				const itemContainer = listContainer.createDiv('flex gap-2 items-center');
				const headerKey = itemContainer.createEl('input', {
					cls: 'flex-1',
					placeholder: t('headerKeyPlaceholder'),
					type: 'text',
					value: key,
				});
				headerKey.spellcheck = false;
				headerKey.addEventListener('input', () => (header.key = headerKey.value));
				if (type === 'plaintext') {
					const headerValue = itemContainer.createEl('input', {
						cls: 'flex-1',
						placeholder: t('headerValuePlaceholder'),
						type: 'text',
						value,
					});
					headerValue.spellcheck = false;
					headerValue.addEventListener('input', () => (header.value = headerValue.value));
				} else
					new SecretComponent(app, itemContainer)
						.setValue(value)
						.onChange((val) => (header.value = val));

				const trash = itemContainer.createEl(
					'button',
					'clickable-icon aspect-square color-[--color-red]',
				);
				setIcon(trash, 'trash-2');
				trash.onClickEvent(() => {
					headers.splice(index, 1);
					updateList();
				});
			});
		};
		updateList();
		const addRow = contentEl.createDiv('mb-2 flex justify-end gap-1');
		const addSecret = addRow.createEl('button', 'clickable-icon aspect-square');
		setIcon(addSecret, 'key-round');
		setTooltip(addSecret, t('addSecretHeader'));
		const add = addRow.createEl('button', 'clickable-icon aspect-square');
		setIcon(add, 'plus');
		setTooltip(add, t('add'));
		addSecret.onClickEvent(() => {
			headers.push({ key: '', type: 'secret', value: '' });
			updateList();
		});
		add.onClickEvent(() => {
			headers.push({ key: '', type: 'plaintext', value: '' });
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
						const validHeaders: CustomHeaders = [];
						headers.forEach((header) => {
							if (!header.key.trim()) return;
							validHeaders.push(header);
						});
						this.onSave(validHeaders);
						if (validHeaders.length !== headers.length)
							new Notice(
								t('omittedInvalidEntry', {
									count: headers.length - validHeaders.length,
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
