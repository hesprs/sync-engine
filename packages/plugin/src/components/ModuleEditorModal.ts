import { normalizeUrl } from '@repo/shared/path';
import { App, Modal, Setting } from 'obsidian';
import type { AugmentedModuleMeta } from '@/modules/Extensibility';
import type { Fragment, Translate } from '@/modules/I18n';
import type { MaybePromise } from '@/types';
import { reactivelyValidate } from '@/settings/utils';
import sha256 from '@/utils/sha-256';

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
};

export default class ModuleEditorModal extends Modal {
	private saved = false;

	constructor(
		private readonly ctx: { app: App; translate: Translate<ModuleEditorTranslations> },
		private readonly options: {
			initial: Partial<AugmentedModuleMeta> & { id: string };
			file?: string;
			onSave: (updated: AugmentedModuleMeta) => MaybePromise<void>;
			onCancel?: () => MaybePromise<void>;
		},
	) {
		super(ctx.app);
		this.contentEl.addClass('sync-engine-setting');
	}

	onOpen() {
		const { translate } = this.ctx;
		const { initial, onSave, file } = this.options;
		const {
			enabled = false,
			name,
			icon,
			description,
			source,
			integrity = '<placeholder>',
			version,
			main = '',
			readme,
		} = initial;

		const magic = file ? parseMagicBytes(file) : {};
		const updated: AugmentedModuleMeta = {
			...this.options.initial,
			description: description || magic.description || 'An unknown module.',
			enabled,
			icon: icon || magic.icon || 'puzzle',
			integrity,
			main,
			name: name || magic.name || 'Unknown Module',
			readme: readme || magic.readme || undefined,
			source: source || magic.source || '',
			version: version || magic.version || '0.0.1',
		};
		if (magic.readme) updated.readme ??= magic.readme;

		let integrityEnabled = integrity !== '';
		this.setTitle(translate('editModuleInformation'));

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
				text
					.setValue(updated.name)
					.setPlaceholder(translate('namePlaceholder'))
					.inputEl.addEventListener('blur', () => {
						const trimmed = text.getValue().trim();
						text.setValue(trimmed);
						updated.name = trimmed;
					}),
			);

		new Setting(this.contentEl)
			.setName(translate('description'))
			.setDesc(translate('descriptionDescription'))
			.addTextArea((text) =>
				text
					.setValue(updated.description)
					.setPlaceholder(translate('descriptionPlaceholder'))
					.inputEl.addEventListener('blur', () => {
						const trimmed = text.getValue().trim();
						text.setValue(trimmed);
						updated.description = trimmed;
					}),
			);

		new Setting(this.contentEl)
			.setName(translate('icon'))
			.setDesc(translate('iconDescription'))
			.addText((text) =>
				text
					.setValue(updated.icon)
					.setPlaceholder(translate('iconPlaceholder'))
					.inputEl.addEventListener('blur', () => {
						const trimmed = text.getValue().trim();
						text.setValue(trimmed);
						updated.icon = trimmed;
					}),
			);

		new Setting(this.contentEl)
			.setName(translate('update'))
			.setDesc(translate('updateDescription'))
			.addText((text) => {
				text.setPlaceholder(translate('updatePlaceholder')).setValue(updated.source);
				reactivelyValidate<string>({
					onSave: (value) => (updated.source = value),
					parse: (value) => {
						if (!value.trim()) return '';
						try {
							return normalizeUrl(value);
						} catch {
							// Return undefined
						}
					},
					text,
				});
			});

		new Setting(this.contentEl)
			.setName(translate('readmePage'))
			.setDesc(translate('readmePageDescription'))
			.addText((text) => {
				text.setValue(updated.readme ?? '').setPlaceholder(
					translate('readmePagePlaceholder'),
				);
				reactivelyValidate<string>({
					onSave: (value) => (updated.source = value),
					parse: (value) => {
						if (!value.trim()) return '';
						try {
							return normalizeUrl(value);
						} catch {
							// Return undefined
						}
					},
					text,
				});
			});

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
						const newHash = integrityEnabled
							? file
								? await sha256(file)
								: integrity
							: '';
						await onSave(Object.assign(updated, { integrity: newHash }));
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

function parseMagicBytes(file: string): Record<string, string> {
	const block = /^\s*\/\*!(?<block>[\s\S]*?)\*\//u.exec(file)?.groups?.block ?? '';
	return Object.fromEntries(
		[...block.matchAll(/^(?<key>.+?):\s*(?<value>.*)$/gmu)].map(({ groups }) => {
			const { key, value } = groups as { key: string; value: string };
			return [key.trim(), value.trim()];
		}),
	);
}
