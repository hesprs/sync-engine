import TaskRow from './TaskRow';
import { setIcon } from 'obsidian';
import { createEffect, For, Show } from 'solid-js';
import type { FileTreeTranslations } from '.';
import type { FileTreeData } from './types';
import type { Translate } from '@/modules/I18n';
import type { BaseTask } from '@/sync';
import type { JSX } from 'solid-js';

export default function App(props: {
	data: FileTreeData;
	isSelected: (nodeId: string) => boolean;
	getTask: (nodeId: string) => BaseTask | undefined;
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
						isSelected={props.isSelected(nodeId)}
						node={props.data.nodes[nodeId]}
						nodeId={nodeId}
						task={props.getTask(nodeId)}
						toggle={props.toggle}
						translate={props.translate}
					/>
				)}
			</For>
		</div>
	);
}
