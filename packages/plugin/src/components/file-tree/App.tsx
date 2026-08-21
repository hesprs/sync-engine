import type { JSX } from 'solid-js';
import { setIcon, setTooltip } from 'obsidian';
import { createEffect, For } from 'solid-js';
import type { Translate } from '@/modules/I18n';
import type { FileTreeTranslations } from '.';
import type { FileTreeData } from './types';
import constructTaskIcon from '../construct-task-icon';

export default function App(props: {
	data: FileTreeData;
	isSelected: (nodeId: string) => boolean;
	toggle: (nodeId: string, nextSelected: boolean) => void;
	translate: Translate<FileTreeTranslations>;
}): JSX.Element {
	const selectedCount = () =>
		props.data.taskNodeIds.filter((nodeId) => props.isSelected(nodeId)).length;
	const allSelected = () => selectedCount() === props.data.taskNodeIds.length;
	const someSelected = () => selectedCount() > 0 && !allSelected();
	const toggleAll = () => {
		const nextSelected = selectedCount() === 0;
		for (const nodeId of props.data.taskNodeIds) props.toggle(nodeId, nextSelected);
	};

	return (
		<div class="flex flex-col gap-1">
			<div class="flex min-h-7 items-center" onClick={toggleAll}>
				<div class="mx-1 flex min-w-0 items-center gap-2">
					<input
						checked={allSelected()}
						class="m-0! cursor-pointer accent-[--interactive-accent]"
						ref={(element) => {
							createEffect(() => {
								element.indeterminate = someSelected();
							});
						}}
						type="checkbox"
					/>
					<div class="h-4 w-4" ref={(element) => setIcon(element, 'folders')} />
					<div class="min-w-0 break-words text-[--text-normal]">
						{props.translate('selectAll')}
						<span class="ml-2 color-[--text-muted]">
							{props.translate('xSelected', { x: selectedCount() })}
						</span>
					</div>
				</div>
			</div>
			<For each={props.data.orderedNodeIds}>
				{(nodeId) => {
					const node = props.data.nodes[nodeId];
					const task = node.task;
					const taskIsDir = task?.local?.isDir ?? task?.remote?.isDir ?? false;
					const isSelected = () => (task ? props.isSelected(nodeId) : false);
					return (
						<div
							class="flex min-h-7 items-center"
							style={{ 'padding-left': `${node.depth * 24}px` }}
						>
							<div
								class="flex min-w-0 items-center gap-2 mx-1"
								onClick={() => task && props.toggle(nodeId, !isSelected())}
							>
								{task ? (
									<input
										checked={isSelected()}
										class="m-0 accent-[--interactive-accent] cursor-pointer"
										style={{ 'margin-inline-end': '0' }}
										type="checkbox"
									/>
								) : (
									<div class="m-1 h-2 w-2 flex-shrink-0 rounded-full bg-[--text-muted]" />
								)}
								<div
									class="w-[--icon-size] h-[--icon-size]"
									ref={(element) => {
										if (task) {
											constructTaskIcon(element, task.name, taskIsDir);
											setTooltip(element, task.prettyName);
										} else setIcon(element, 'folder-open');
									}}
								/>
								<div
									class={
										task && !isSelected()
											? 'min-w-0 break-words text-[--text-muted]'
											: 'min-w-0 break-words text-[--text-normal]'
									}
								>
									{node.compressedLabel}
								</div>
							</div>
						</div>
					);
				}}
			</For>
		</div>
	);
}
