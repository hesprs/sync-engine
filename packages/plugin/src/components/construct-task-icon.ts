import { getTaskSide } from '@/sync';
import { setIcon } from 'obsidian';
import type { TaskNames } from '@/sync';

type IconColor = { icon: string; color: string };

export default function constructTaskIcon(
	element: HTMLElement,
	name: TaskNames,
	isDir: boolean,
): HTMLElement {
	element.addClass('se-relative', 'se-aspect-square');
	const { icon: mainIcon, color: mainColor } = getMain(name, isDir);
	setIcon(element, mainIcon);
	const main = getIcon(element);
	main.setAttr('stroke', mainColor);
	const auxiliaryIconColor = getAuxiliary(name);
	if (!auxiliaryIconColor) return element;
	main.addClass('se-cropped-icon');
	const { icon: auxiliaryIcon, color: auxiliaryColor } = auxiliaryIconColor;
	setIcon(element, auxiliaryIcon);
	const auxiliary = getIcon(element);
	auxiliary.addClass(
		'se-absolute',
		'se-bottom-0',
		'se-right-0',
		'se-w-50%!',
		'se-h-50%!',
		'se-stroke-width-4!',
	);
	auxiliary.setAttr('stroke', auxiliaryColor);
	element.empty();
	element.append(main, auxiliary);
	return element;
}

function getIcon(element: HTMLElement) {
	return element.lastElementChild as SVGSVGElement;
}

function getMain(name: TaskNames, isDir: boolean): IconColor {
	const color = 'currentColor';
	const red = 'var(--color-red)';
	if (name === 'createLocalDir' || name === 'createRemoteDir') return { color, icon: 'folder' };
	if (name === 'resolveConflict') return { color: 'var(--color-yellow)', icon: 'combine' };
	if (name === 'download' || name === 'upload') return { color, icon: 'file' };
	if (name === 'removeLocal' || name === 'removeRemote')
		return { color: red, icon: isDir ? 'folder-x' : 'file-x' };
	if (name === 'moveLocal' || name === 'moveRemote')
		return { color, icon: isDir ? 'folder-output' : 'file-output' };
	return { color, icon: 'refresh-cw' };
}

function getAuxiliary(name: TaskNames): IconColor | undefined {
	const side = getTaskSide(name);
	if (side === 'local') return { color: 'var(--color-green)', icon: 'arrow-down' };
	if (side === 'remote') return { color: 'var(--color-blue)', icon: 'arrow-up' };
}
