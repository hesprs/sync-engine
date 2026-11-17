import { ProgressBarComponent } from 'obsidian';

export default function renderProgress(container: HTMLElement, extraClass?: string) {
	const progressSection = container.createDiv(`se-flex se-flex-col se-gap-2 ${extraClass ?? ''}`);
	const progressTextContainer = progressSection.createDiv(
		'se-flex se-flex-row se-text-3 se-text-[--text-muted] se-whitespace-nowrap',
	);
	const left = progressTextContainer.createDiv('se-truncate se-mr-auto');
	const right = progressTextContainer.createDiv('se-ml-2');
	const bar = new ProgressBarComponent(progressSection);
	return { bar, left, right };
}
