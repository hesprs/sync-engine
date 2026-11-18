import { setIcon } from 'obsidian';

type RenderedIconState = { badge?: 'warning' | 'error'; spinning: boolean };
const renderedIconState = new WeakMap<HTMLElement, RenderedIconState>();

const BADGE_STYLES = {
	error: { icon: 'x-circle', stroke: 'var(--text-error, #f85149)' },
	warning: { icon: 'alert-circle', stroke: 'var(--text-warning, #f59e0b)' },
} as const;

function toggleSpin(el: Element | null | undefined, spinning: boolean): void {
	if (!el) return;
	if (spinning) (el as HTMLElement).addClass('animate-spin');
	else (el as HTMLElement).removeClass('animate-spin');
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
		toggleSpin(existingMain.firstElementChild, spinning);
		prev.spinning = spinning;
		return;
	}

	container.empty();
	container.style.position = 'relative';
	container.style.display = 'inline-flex';
	container.style.alignItems = 'center';
	container.style.justifyContent = 'center';

	const mainWrapper = container.createSpan({ cls: 'sync-engine-main-icon' });
	mainWrapper.style.display = 'inline-flex';
	mainWrapper.style.alignItems = 'center';
	mainWrapper.style.justifyContent = 'center';
	setIcon(mainWrapper, 'refresh-cw');
	toggleSpin(mainWrapper, spinning);
	toggleSpin(mainWrapper.firstElementChild, spinning);

	if (badge) {
		const { icon, stroke } = BADGE_STYLES[badge];
		const badgeWrapper = container.createSpan({ cls: 'sync-engine-badge-icon' });
		badgeWrapper.style.position = 'absolute';
		badgeWrapper.style.bottom = '-2px';
		badgeWrapper.style.right = '-2px';
		badgeWrapper.style.width = '60%';
		badgeWrapper.style.height = '60%';
		badgeWrapper.style.display = 'inline-flex';
		badgeWrapper.style.alignItems = 'center';
		badgeWrapper.style.justifyContent = 'center';
		badgeWrapper.style.pointerEvents = 'none';
		setIcon(badgeWrapper, icon);
		const badgeSvg = badgeWrapper.firstElementChild as HTMLElement | null;
		if (badgeSvg) {
			badgeSvg.style.width = '100%';
			badgeSvg.style.height = '100%';
			badgeSvg.style.stroke = stroke;
			badgeSvg.style.fill = 'var(--background-primary, #1e1e1e)';
			badgeSvg.style.strokeWidth = '2.5';
		}
	}

	renderedIconState.set(container, { badge, spinning });
}
