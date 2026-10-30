import constructTaskIcon from '../construct-task-icon';
import { setIcon, setTooltip } from 'obsidian';
import { createEffect, Show } from 'solid-js';
import type { FileTreeTranslations } from '.';
import type { FileTreeNode } from './types';
import type { Translate } from '@/modules/I18n';
import type { Task } from '@/sync';
import type { JSX } from 'solid-js';

export default function TaskRow(props: {
	nodeId: string;
	node: FileTreeNode;
	task: Task | undefined;
	isSelected: boolean;
	toggle: (nodeId: string, nextSelected: boolean) => void;
	translate: Translate<FileTreeTranslations>;
}): JSX.Element {
	const isSelected = () => props.task !== undefined && props.isSelected;
	const moveSource = () => {
		const { task } = props;
		return task?.name === 'moveLocal' || task?.name === 'moveRemote'
			? task.options.oldKey
			: undefined;
	};

	return (
		<div
			class="flex w-fit items-center gap-2 pr-3"
			onClick={() => props.task && props.toggle(props.nodeId, !isSelected())}
			style={{ 'padding-left': `${props.node.depth * 24}px` }}
		>
			{props.task ? (
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
				ref={(element) =>
					createEffect(() => {
						const task = props.task;
						if (task) {
							constructTaskIcon(
								element,
								task.name,
								task.local?.isDir ?? task.remote?.isDir ?? false,
							);
							setTooltip(element, props.translate(task.name));
						} else setIcon(element, 'folder-open');
					})
				}
			/>
			<div
				class={`flex items-center gap-2 whitespace-nowrap ${isSelected() ? 'text-[--text-normal]' : 'text-[--text-muted]'}`}
			>
				{props.node.compressedLabel}
				<Show when={moveSource()}>
					{(oldKey) => (
						<>
							<div
								class="h-3.5 w-3.5 text-[--text-faint]"
								ref={(element) => setIcon(element, 'arrow-left')}
							/>
							<span class="text-[--text-faint]">
								{oldKey().split('/').filter(Boolean).join(' / ')}
							</span>
						</>
					)}
				</Show>
			</div>
		</div>
	);
}
