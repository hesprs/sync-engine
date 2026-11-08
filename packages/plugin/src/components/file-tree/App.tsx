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
		<div class="flex flex-col gap-2">
			<Show when={props.data.taskNodeIds.length > 1}>
				<div
					class="flex items-center gap-2 whitespace-nowrap w-fit pr-3"
					onClick={toggleAll}
				>
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
					<div class="text-[--text-normal] whitespace-nowrap">
						{props.translate('selectAll')}
						<span class="ml-2 color-[--text-muted]">
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
