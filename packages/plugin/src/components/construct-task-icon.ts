import { setIcon } from 'obsidian';
import type { TaskNames } from '@/sync';

type IconColor = { icon: string; color: string };

export default function constructTaskIcon(
	element: HTMLElement,
	name: TaskNames,
	isDir: boolean,
): HTMLElement {
	element.addClasses(['relative', 'aspect-square']);
	const { icon: mainIcon, color: mainColor } = getMain(name, isDir);
	setIcon(element, mainIcon);
	const main = getIcon(element);
	main.addClass('sync-engine-cropped-icon');
	main.setAttr('stroke', mainColor);
	const auxiliaryIconColor = getAuxiliary(name);
	if (!auxiliaryIconColor) return element;
	const { icon: auxiliaryIcon, color: auxiliaryColor } = auxiliaryIconColor;
	setIcon(element, auxiliaryIcon);
	const auxiliary = getIcon(element);
	auxiliary.addClasses([
		'absolute',
		'bottom-0',
		'right-0',
		'w-50%!',
		'h-50%!',
		'stroke-width-4!',
	]);
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
	if (name === 'createRemoteDir') return { color, icon: 'folder-up' };
	if (name === 'createLocalDir') return { color, icon: 'folder-down' };
	if (name === 'resolveConflict') return { color: 'var(--color-yellow)', icon: 'combine' };
	if (name === 'download' || name === 'upload') return { color, icon: 'file' };
	if (name === 'removeLocal' || name === 'removeRemote')
		return { color: red, icon: isDir ? 'folder-x' : 'file-x' };
	if (name === 'moveLocal' || name === 'moveRemote')
		return { color, icon: isDir ? 'folder-output' : 'file-output' };
	return { color, icon: 'refresh-cw' };
}

function getAuxiliary(name: TaskNames): IconColor | undefined {
	if (name === 'resolveConflict') return;
	if (
		name === 'removeLocal' ||
		name === 'createLocalDir' ||
		name === 'moveLocal' ||
		name === 'download'
	)
		return { color: 'var(--color-green)', icon: 'arrow-down' };
	return { color: 'var(--color-blue)', icon: 'arrow-up' };
}
