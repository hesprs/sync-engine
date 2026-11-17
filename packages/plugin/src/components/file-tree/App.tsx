import TaskRow from './TaskRow';
import { setIcon } from 'obsidian';
import { createEffect, For, Show } from 'solid-js';
import type { FileTreeTranslations } from '.';
import type createFileTreeSelection from './selection';
import type { FileTreeData } from './types';
import type { Translate } from '@/modules/I18n';
import type { JSX } from 'solid-js';

export default function App(props: {
	data: FileTreeData;
	selection: ReturnType<typeof createFileTreeSelection>;
	translate: Translate<FileTreeTranslations>;
}): JSX.Element {
	const selectedCount = () =>
		props.data.taskNodeIds.filter((nodeId) => props.selection.isSelected(nodeId)).length;
	const allSelected = () => selectedCount() === props.data.taskNodeIds.length;
	const someSelected = () => selectedCount() > 0 && !allSelected();
	const toggleAll = () => {
		const nextSelected = selectedCount() === 0;
		for (const nodeId of props.data.taskNodeIds) props.selection.toggle(nodeId, nextSelected);
	};

	return (
		<div class="se-flex se-flex-col se-gap-2">
			<Show when={props.data.taskNodeIds.length > 1}>
				<div
					class="se-flex se-items-center se-gap-2 se-whitespace-nowrap se-w-fit se-pr-3"
					onClick={toggleAll}
				>
					<input
						checked={allSelected()}
						class="se-m-0! se-cursor-pointer se-accent-[--interactive-accent]"
						ref={(element) => {
							createEffect(() => {
								element.indeterminate = someSelected();
							});
						}}
						type="checkbox"
					/>
					<div class="se-h-4 se-w-4" ref={(element) => setIcon(element, 'folders')} />
					<div class="se-text-[--text-normal] se-whitespace-nowrap">
						{props.translate('selectAll')}
						<span class="se-ml-2 se-color-[--text-muted]">
							{props.translate('xSelected', selectedCount())}
						</span>
					</div>
				</div>
			</Show>
			<For each={props.data.orderedNodeIds}>
				{(nodeId) => (
					<TaskRow
						isSelected={props.selection.isSelected(nodeId)}
						node={props.data.nodes[nodeId]}
						nodeId={nodeId}
						task={props.selection.getTask(nodeId)}
						toggle={props.selection.toggle}
						translate={props.translate}
					/>
				)}
			</For>
		</div>
	);
}
