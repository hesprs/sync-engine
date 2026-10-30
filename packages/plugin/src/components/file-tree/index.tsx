import App from './App';
import createFileTreeSelection from './selection';
import createFileTreeData from './tree-data';
import { createRoot } from 'solid-js';
import { render } from 'solid-js/web';
import type { Snippet, Translate } from '@/modules/I18n';
import type { Task, TaskNames } from '@/sync';

export type FileTreeTranslations = { selectAll: string; xSelected: Snippet<number> } & Record<
	TaskNames,
	string
>;

export default function mount(
	el: Element,
	tasks: Array<Task>,
	translate: Translate<FileTreeTranslations>,
) {
	const data = createFileTreeData(tasks);
	return createRoot((dispose) => {
		const selection = createFileTreeSelection(data);
		const unmount = render(
			() => <App data={data} selection={selection} translate={translate} />,
			el,
		);
		return {
			getState: selection.getState,
			unmount() {
				unmount();
				dispose();
			},
		};
	});
}
