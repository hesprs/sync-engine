import App from './App';
import createFileTreeSelection from './selection';
import createFileTreeData from './tree-data';
import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { render } from 'solid-js/web';
import type { Snippet, Translate } from '@/modules/I18n';
import type { BaseTask, TaskNames } from '@/sync';

export type FileTreeTranslations = { selectAll: string; xSelected: Snippet<number> } & Record<
	TaskNames,
	string
>;

export default function mount(
	el: Element,
	tasks: Array<BaseTask>,
	translate: Translate<FileTreeTranslations>,
) {
	const data = createFileTreeData(tasks);
	const selection = createFileTreeSelection(data);
	const initialSelectedById = Object.fromEntries(
		data.taskNodeIds.map((taskNodeId) => [taskNodeId, true]),
	);
	const [version, bumpVersion] = createSignal(0);

	const unmount = render(() => {
		const [selectedById, setSelectedById] =
			createStore<Record<string, boolean>>(initialSelectedById);

		return (
			<App
				data={data}
				isSelected={(nodeId) => selectedById[nodeId] ?? false}
				getTask={(nodeId) => {
					version();
					return selection.getTask(nodeId);
				}}
				translate={translate}
				toggle={(nodeId, nextSelected) => {
					const changed = selection.toggle(nodeId, nextSelected);
					for (const changedNodeId of changed)
						setSelectedById(changedNodeId, selection.isSelected(changedNodeId));
					if (changed.size > 0) bumpVersion((count) => count + 1);
				}}
			/>
		);
	}, el);

	return { getState: selection.getState, unmount };
}
