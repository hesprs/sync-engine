import { setIcon } from 'obsidian';

type RenderedIconState = { badge?: 'warning' | 'error'; spinning: boolean };
const renderedIconState = new WeakMap<HTMLElement, RenderedIconState>();

const BADGE_STYLES = {
	error: { icon: 'x-circle', stroke: 'var(--text-error, #f85149)' },
	warning: { icon: 'alert-circle', stroke: 'var(--text-warning, #f59e0b)' },
} as const;

function toggleSpin(el: Element | undefined, spinning: boolean): void {
	if (!el) return;
	if (spinning) (el as HTMLElement).addClass('se-animate-spin');
	else (el as HTMLElement).removeClass('se-animate-spin');
}

export function setAttrIfChanged(el: HTMLElement, name: string, value?: string): void {
	const current = el.getAttribute(name);
	if (value === undefined) {
		if (typeof current === 'string') el.removeAttribute(name);
	} else if (current !== value) el.setAttribute(name, value);
}

/** Renders or incrementally updates the sync icon, spin state, and status badge in a container. */
export default function renderSyncIcon(
	container: HTMLElement,
	badge?: 'warning' | 'error',
	spinning = false,
): void {
	const prev = renderedIconState.get(container);
	const existingMain = container.firstElementChild as HTMLElement | undefined;
	if (prev && existingMain?.hasClass?.('sync-engine-main-icon') && prev.badge === badge) {
		if (prev.spinning === spinning) return;
		toggleSpin(existingMain, spinning);
		toggleSpin(existingMain.firstElementChild ?? undefined, spinning);
		prev.spinning = spinning;
		return;
	}

	container.empty();
	container.addClass('se-relative', 'se-inline-flex', 'se-items-center', 'se-justify-center');

	const mainWrapper = container.createSpan({
		cls: 'sync-engine-main-icon se-inline-flex se-items-center se-justify-center',
	});
	setIcon(mainWrapper, 'refresh-cw');
	toggleSpin(mainWrapper, spinning);
	toggleSpin(mainWrapper.firstElementChild ?? undefined, spinning);

	if (badge) {
		const { icon, stroke } = BADGE_STYLES[badge];
		const badgeWrapper = container.createSpan({
			cls: 'sync-engine-badge-icon se-absolute se-w-60% se-h-60% se-inline-flex se-items-center se-justify-center se-pointer-events-none',
		});
		badgeWrapper.style.bottom = '-2px';
		badgeWrapper.style.right = '-2px';
		setIcon(badgeWrapper, icon);
		const badgeSvg = badgeWrapper.firstElementChild as HTMLElement | undefined;
		if (badgeSvg) {
			badgeSvg.addClass('se-w-full', 'se-h-full');
			badgeSvg.style.stroke = stroke;
			badgeSvg.style.fill = 'var(--background-primary, #1e1e1e)';
			badgeSvg.style.strokeWidth = '2.5';
		}
	}

	renderedIconState.set(container, { badge, spinning });
}
