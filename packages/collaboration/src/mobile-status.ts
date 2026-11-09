import { text } from '@/utils';
import { Notice, Platform, setIcon } from 'obsidian';
import type { CollaborationTranslations } from '@/i18n';
import type { CollaborationStatus } from '@/setting';
import type { Translate } from '@hesprs/sync-engine-sdk';
import type { App, WorkspaceLeaf } from 'obsidian';

export function getStatusText(
	status: CollaborationStatus,
	error: Error | undefined,
	translate: Translate<CollaborationTranslations>,
): string {
	if (status === 'connected') return text(translate('statusConnected'));
	if (status === 'connecting') return text(translate('statusConnecting'));
	if (status === 'reconnecting') return text(translate('statusReconnecting'));
	if (status === 'error') {
		const detail = error?.message ? `: ${error.message}` : '';
		return `${text(translate('statusError'))}${detail}`;
	}
	return text(translate('statusDisabled'));
}

export function showStatusNotice(
	status: CollaborationStatus,
	error: Error | undefined,
	translate: Translate<CollaborationTranslations>,
): void {
	const statusText = getStatusText(status, error, translate);
	new Notice(`${text(translate('collaboration'))}: ${statusText}`);
}

export function cleanupMobileHeaderIcons(): void {
	if (typeof document === 'undefined') return;
	document.querySelectorAll('.sync-engine-collab-action').forEach((el) => el.remove());
}

export type MobileHeaderOptions = {
	app: App;
	enabled: boolean;
	error?: Error;
	status: CollaborationStatus;
	translate: Translate<CollaborationTranslations>;
};

export function updateMobileHeaderIcons(options: MobileHeaderOptions): void {
	const { app, enabled, error, status, translate } = options;
	if (typeof document === 'undefined') return;
	if (!Platform.isMobile) return;

	if (!enabled || status === 'disabled') {
		cleanupMobileHeaderIcons();
		return;
	}

	if (!app.workspace?.iterateRootLeaves) return;

	app.workspace.iterateRootLeaves((leaf: WorkspaceLeaf) => {
		const container = leaf.view?.containerEl;
		if (!container) return;
		const viewActions =
			container.querySelector('.view-actions') ??
			container.closest('.workspace-leaf-content')?.querySelector('.view-actions');
		if (!viewActions) return;

		let btn = viewActions.querySelector<HTMLElement>('.sync-engine-collab-action');
		if (!btn) {
			btn = viewActions.createEl('button', {
				cls: 'clickable-icon view-action sync-engine-collab-action',
			});
			viewActions.prepend(btn);
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				showStatusNotice(status, error, translate);
			});
		}

		btn.empty();
		btn.style.display = 'inline-flex';
		btn.style.alignItems = 'center';
		btn.style.justifyContent = 'center';

		if (status === 'connected') {
			setIcon(btn, 'wifi');
			btn.style.color = 'var(--text-success, #2ea043)';
			const label = `${text(translate('collaboration'))}: ${text(translate('statusConnected'))}`;
			btn.setAttribute('aria-label', label);
			btn.setAttribute('title', label);
		} else if (status === 'connecting' || status === 'reconnecting') {
			setIcon(btn, 'wifi');
			btn.style.color = 'var(--text-warning, #f59e0b)';
			const statusKey = status === 'reconnecting' ? 'statusReconnecting' : 'statusConnecting';
			const label = `${text(translate('collaboration'))}: ${text(translate(statusKey))}`;
			btn.setAttribute('aria-label', label);
			btn.setAttribute('title', label);
		} else if (status === 'error') {
			setIcon(btn, 'wifi-off');
			btn.style.color = 'var(--text-error, #f85149)';
			const errorDetail = error?.message ? ` (${error.message})` : '';
			const label = `${text(translate('collaboration'))}: ${text(translate('statusError'))}${errorDetail}`;
			btn.setAttribute('aria-label', label);
			btn.setAttribute('title', label);
		} else btn.remove();
	});
}
