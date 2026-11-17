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
			class="se-flex se-w-fit se-items-center se-gap-2 se-pr-3"
			onClick={() => props.task && props.toggle(props.nodeId, !isSelected())}
			style={{ 'padding-left': `${props.node.depth * 24}px` }}
		>
			{props.task ? (
				<input
					checked={isSelected()}
					class="se-m-0 se-accent-[--interactive-accent] se-cursor-pointer"
					style={{ 'margin-inline-end': '0' }}
					type="checkbox"
				/>
			) : (
				<div class="se-m-1 se-h-2 se-w-2 se-flex-shrink-0 se-rounded-full se-bg-[--text-muted]" />
			)}
			<div
				class="se-w-[--icon-size] se-h-[--icon-size]"
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
				class={`se-flex se-items-center se-gap-2 se-whitespace-nowrap ${isSelected() ? 'se-text-[--text-normal]' : 'se-text-[--text-muted]'}`}
			>
				{props.node.compressedLabel}
				<Show when={moveSource()}>
					{(oldKey) => (
						<>
							<div
								class="se-h-3.5 se-w-3.5 se-text-[--text-faint]"
								ref={(element) => setIcon(element, 'arrow-left')}
							/>
							<span class="se-text-[--text-faint]">
								{oldKey().split('/').filter(Boolean).join(' / ')}
							</span>
						</>
					)}
				</Show>
			</div>
		</div>
	);
}
