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
	const itemEl = detailContainer.createDiv('w-100% flex flex-col gap-3');
	detailContainer.removeClass('hidden');
	failedTasks.forEach(({ name, isDir, key, error }) => {
		const row = itemEl.createDiv();
		const main = row.createDiv('break-words flex items-center gap-2');
		const icon = main.createSpan('w-[--icon-size] h-[--icon-size] color-[--color-red]');
		constructTaskIcon(icon, name, isDir);
		setTooltip(icon, translate(name));
		const path = main.createSpan({ cls: 'font-semibold truncate select-text', text: key });
		path.onClickEvent(() => path.classList.toggle('truncate'));
		setTooltip(path, key);
		row.createDiv({
			cls: 'text-[--text-muted] break-words mt-1 select-text',
			text: error.message,
		});
	});
}
