import { mountModuleManagement } from '@/components/module-management';
import { SettingPage } from 'obsidian';
import type { CodeInputTranslations } from '@/components/CodeInputModal';
import type {
	ModuleManagementContext,
	ModuleManagementTranslations,
} from '@/components/module-management';
import type { ModuleEditorTranslations } from '@/components/ModuleEditorModal';

export type ModulesTranslations = ModuleEditorTranslations &
	ModuleManagementTranslations &
	CodeInputTranslations;

export default class ModuleManagement extends SettingPage {
	private cleanup?: () => void;

	constructor(private readonly ctx: ModuleManagementContext) {
		super();
		this.title = ctx.translate('moduleManagement');
	}

	display() {
		this.cleanup = mountModuleManagement(this.containerEl, this.ctx);
	}

	hide() {
		this.cleanup?.();
		this.containerEl.empty();
	}
}
