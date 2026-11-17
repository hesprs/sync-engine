import constructTaskIcon from './construct-task-icon';
import { setTooltip } from 'obsidian';
import type { FailedTaskInfo } from '@/modules/Sync';
import type { TaskNames, Translate } from '@/sdk';

export default function renderFailedTasks(
	detailContainer: HTMLDivElement,
	failedTasks: Array<FailedTaskInfo>,
	translate: Translate<Record<TaskNames, string>>,
): void {
	detailContainer.empty();
	const itemEl = detailContainer.createDiv('se-w-100% se-flex se-flex-col se-gap-3');
	detailContainer.removeClass('se-hidden');
	failedTasks.forEach(({ name, isDir, key, error }) => {
		const row = itemEl.createDiv();
		const main = row.createDiv('se-break-words se-flex se-items-center se-gap-2');
		const icon = main.createSpan(
			'se-w-[--icon-size] se-h-[--icon-size] se-color-[--color-red]',
		);
		constructTaskIcon(icon, name, isDir);
		setTooltip(icon, translate(name));
		const path = main.createSpan({
			cls: 'se-font-semibold se-truncate se-select-text',
			text: key,
		});
		path.onClickEvent(() => path.classList.toggle('se-truncate'));
		setTooltip(path, key);
		row.createDiv({
			cls: 'se-text-[--text-muted] se-break-words se-mt-1 se-select-text',
			text: error.message,
		});
	});
}
