import { text } from '@/utils';
import { Notice } from 'obsidian';
import type { CollaborationTranslations } from '@/i18n';
import type { CollaborationStatus } from '@/setting';
import type { Translate } from '@hesprs/sync-engine-sdk';

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
