import { ConfirmationModal } from 'obsidian';
import type { Fragment, Translate } from '@/modules/I18n';
import type { MaybePromise } from '@/types';
import type { App, ToggleComponent } from 'obsidian';

export type MigrationModalTranslations = {
	cancel: string;
	confirm: string;
	remoteMigration: string;
	migrationInstruction: Fragment<boolean>;
	warning: string;
};

export default function setNeedMigration(
	{ app, translate }: { app: App; translate: Translate<MigrationModalTranslations> },
	{
		toggle,
		needMigration,
		apply,
		content,
	}: {
		toggle: ToggleComponent;
		needMigration?: (value: boolean) => MaybePromise<boolean>;
		content?: (value: boolean) => string | DocumentFragment | void;
		apply: (value: boolean) => MaybePromise<void>;
	},
) {
	let selfTrigger = false;
	toggle.onChange((value) => {
		if (selfTrigger) {
			selfTrigger = false;
			return;
		}
		const showMigration = async (need: boolean) => {
			const text = content?.(value);
			if (need || text) {
				selfTrigger = true;
				toggle.setValue(!value); // Revert UI back, not migrated yet
				const modal = new ConfirmationModal(app)
					.setTitle(translate(need ? 'remoteMigration' : 'warning'))
					.setContent(
						createFragment((frag) => {
							if (text)
								frag.append(
									text instanceof DocumentFragment
										? text
										: createEl('p', { text }),
								);
							if (need) frag.append(translate('migrationInstruction', value));
						}),
					)
					.addCancelButton(translate('cancel'))
					.addButton((button) =>
						button
							.setButtonText(translate('confirm'))
							.setCta()
							.onClick(() => {
								selfTrigger = true;
								toggle.setValue(value);
								return apply(value);
							}),
					);
				modal.contentEl.addClass('markdown-rendered');
				modal.open();
			} else await apply(value);
		};
		const need = needMigration?.(value) ?? true;
		if (need instanceof Promise) void need.then(showMigration);
		else void showMigration(need);
	});
}
