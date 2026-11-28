import { reactivelyValidate } from '@/settings/utils';
import { sha256Text } from '@repo/shared/crypto';
import { formatUrl, parseUrl } from '@repo/shared/path';
import { App, Modal, Setting, TextAreaComponent, TextComponent } from 'obsidian';
import type { AugmentedModuleMeta } from '@/modules/Extensibility';
import type { Fragment, Translate } from '@/modules/I18n';
import type { MaybePromise } from '@/types';

export type ModuleEditorTranslations = {
	editModuleInformation: string;
	enable: string;
	enableDescription: string;
	name: string;
	namePlaceholder: string;
	nameDescription: string;
	description: string;
	descriptionDescription: string;
	descriptionPlaceholder: string;
	icon: string;
	iconDescription: Fragment;
	iconPlaceholder: string;
	update: string;
	updateDescription: string;
	updatePlaceholder: string;
	integrityVerification: string;
	integrityVerificationDescription: Fragment;
	save: string;
	cancel: string;
	readmePage: string;
	readmePageDescription: string;
	readmePagePlaceholder: string;
	version: string;
	versionDescription: string;
	versionPlaceholder: string;
};

export default class ModuleEditorModal extends Modal {
	private saved = false;

	constructor(
		private readonly ctx: {
			app: App;
			translate: Translate<ModuleEditorTranslations>;
			readModule: (id: string) => Promise<string>;
		},
		private readonly options: {
			initial: AugmentedModuleMeta;
			onSave: (updated: AugmentedModuleMeta) => MaybePromise<void>;
			onCancel?: () => MaybePromise<void>;
		},
	) {
		super(ctx.app);
		this.contentEl.addClass('se-setting');
	}

	onOpen() {
		const { translate, readModule } = this.ctx;
		const { initial, onSave } = this.options;
		const { integrity, enabled, id } = initial;
		const updated: AugmentedModuleMeta = { ...initial };

		let integrityEnabled = integrity !== '';
		this.setTitle(translate('editModuleInformation'));
		const saveOnBlur = (
			text: TextComponent | TextAreaComponent,
			key: 'name' | 'description' | 'version' | 'icon',
		) =>
			text.inputEl.addEventListener('blur', () => {
				const trimmed = text.getValue().trim();
				text.setValue(trimmed);
				updated[key] = trimmed;
			});
		const validateUrl = (text: TextComponent, key: 'readme' | 'source') =>
			reactivelyValidate<string>({
				format: formatUrl,
				onSave: (value) => (updated[key] = value),
				parse: (value) => {
					if (!value.trim()) return '';
					try {
						return parseUrl(value);
					} catch {
						// Return undefined
					}
				},
				text,
			});

		new Setting(this.contentEl)
			.setName(translate('enable'))
			.setDesc(translate('enableDescription'))
			.addToggle((toggle) =>
				toggle.setValue(enabled).onChange((value) => (updated.enabled = value)),
			);

		new Setting(this.contentEl)
			.setName(translate('name'))
			.setDesc(translate('nameDescription'))
			.addText((text) =>
				saveOnBlur(
					text.setValue(updated.name).setPlaceholder(translate('namePlaceholder')),
					'name',
				),
			);

		new Setting(this.contentEl)
			.setName(translate('description'))
			.setDesc(translate('descriptionDescription'))
			.addTextArea((text) => {
				saveOnBlur(
					text
						.setValue(updated.description)
						.setPlaceholder(translate('descriptionPlaceholder')),
					'description',
				);
				text.inputEl.addClass('se-min-w-100%');
			});

		new Setting(this.contentEl)
			.setName(translate('version'))
			.setDesc(translate('versionDescription'))
			.addText((text) => {
				saveOnBlur(
					text.setValue(updated.version).setPlaceholder(translate('versionPlaceholder')),
					'version',
				);
				text.inputEl.addClass('se-min-w-100%');
			});

		new Setting(this.contentEl)
			.setName(translate('icon'))
			.setDesc(translate('iconDescription'))
			.addText((text) =>
				saveOnBlur(
					text.setValue(updated.icon).setPlaceholder(translate('iconPlaceholder')),
					'icon',
				),
			);

		new Setting(this.contentEl)
			.setName(translate('update'))
			.setDesc(translate('updateDescription'))
			.addText((text) =>
				validateUrl(
					text.setPlaceholder(translate('updatePlaceholder')).setValue(updated.source),
					'source',
				),
			);

		new Setting(this.contentEl)
			.setName(translate('readmePage'))
			.setDesc(translate('readmePageDescription'))
			.addText((text) =>
				validateUrl(
					text
						.setValue(formatUrl(updated.readme ?? ''))
						.setPlaceholder(translate('readmePagePlaceholder')),
					'readme',
				),
			);

		new Setting(this.contentEl)
			.setName(translate('integrityVerification'))
			.addToggle((toggle) =>
				toggle.setValue(integrityEnabled).onChange((value) => (integrityEnabled = value)),
			)
			.setDesc(translate('integrityVerificationDescription'));

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(translate('cancel')).onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setCta()
					.setButtonText(translate('save'))
					.onClick(async () => {
						updated.integrity = integrityEnabled
							? integrity ||
								(await readModule(id)
									.then(sha256Text)
									.catch(() => ''))
							: '';
						await onSave(updated);
						this.saved = true;
						this.close();
					}),
			);
	}

	onClose() {
		if (!this.saved) void this.options.onCancel?.();
		this.contentEl.empty();
	}
}
