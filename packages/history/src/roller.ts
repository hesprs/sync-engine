import type { VersionSummary } from './types';

export type MobileRoller = {
	readonly container: HTMLElement;
	update: (selected: VersionSummary, index: number) => void;
};

export function createMobileRoller(options: {
	container: HTMLElement;
	versions: Array<VersionSummary>;
	label: (version: VersionSummary) => string;
	currentBadgeText: string;
	onSelect: (version: VersionSummary) => void;
	onStep: (delta: number) => void;
}): MobileRoller {
	const { container, versions, label, currentBadgeText, onSelect, onStep } = options;

	const roller = container.createEl('div');
	roller.style.display = 'flex';
	roller.style.alignItems = 'center';
	roller.style.height = '32px';
	roller.style.borderRadius = '6px';
	roller.style.border = '1px solid var(--background-modifier-border)';
	roller.style.backgroundColor = 'var(--background-secondary)';
	roller.style.flex = '1';
	roller.style.minWidth = '0';
	roller.style.overflow = 'hidden';
	roller.style.position = 'relative';

	const labelWrap = roller.createEl('div');
	labelWrap.style.display = 'flex';
	labelWrap.style.alignItems = 'center';
	labelWrap.style.justifyContent = 'space-between';
	labelWrap.style.gap = '6px';
	labelWrap.style.flex = '1';
	labelWrap.style.minWidth = '0';
	labelWrap.style.padding = '0 8px';
	labelWrap.style.height = '100%';
	labelWrap.style.position = 'relative';

	const labelEl = labelWrap.createEl('span');
	labelEl.style.fontSize = '12px';
	labelEl.style.whiteSpace = 'nowrap';
	labelEl.style.overflow = 'hidden';
	labelEl.style.textOverflow = 'ellipsis';
	labelEl.style.color = 'var(--text-normal)';

	const countEl = labelWrap.createEl('span');
	countEl.style.fontSize = '11px';
	countEl.style.color = 'var(--text-muted)';
	countEl.style.flexShrink = '0';

	const selectEl = labelWrap.createEl('select');
	selectEl.style.position = 'absolute';
	selectEl.style.inset = '0';
	selectEl.style.opacity = '0';
	selectEl.style.width = '100%';
	selectEl.style.height = '100%';
	selectEl.style.cursor = 'pointer';

	for (const [idx, v] of versions.entries()) {
		const opt = selectEl.createEl('option', { value: String(idx) });
		const badge = idx === 0 ? ` ${currentBadgeText}` : '';
		opt.text = `${label(v)}${badge}`;
	}

	selectEl.addEventListener('change', () => {
		const idx = Number.parseInt(selectEl.value, 10);
		const target = versions[idx];
		if (target) onSelect(target);
	});

	let touchStartY = 0;
	let touchStartX = 0;
	labelWrap.addEventListener(
		'touchstart',
		(e) => {
			const touch = e.touches[0];
			if (touch) {
				touchStartY = touch.clientY;
				touchStartX = touch.clientX;
			}
		},
		{ passive: true },
	);

	labelWrap.addEventListener(
		'touchend',
		(e) => {
			const touch = e.changedTouches[0];
			if (!touch) return;
			const deltaY = touch.clientY - touchStartY;
			const deltaX = touch.clientX - touchStartX;
			if (Math.abs(deltaY) > 20 && Math.abs(deltaY) > Math.abs(deltaX)) {
				e.preventDefault();
				selectEl.blur();
				if (deltaY > 0) onStep(-1);
				else onStep(1);
			}
		},
		{ passive: false },
	);

	roller.addEventListener(
		'wheel',
		(e) => {
			e.preventDefault();
			if (e.deltaY > 0) onStep(1);
			else if (e.deltaY < 0) onStep(-1);
		},
		{ passive: false },
	);

	const stepper = roller.createEl('div');
	stepper.style.display = 'flex';
	stepper.style.flexDirection = 'column';
	stepper.style.width = '24px';
	stepper.style.height = '100%';
	stepper.style.borderLeft = '1px solid var(--background-modifier-border)';
	stepper.style.flexShrink = '0';

	const prevBtn = stepper.createEl('button');
	prevBtn.style.flex = '1';
	prevBtn.style.padding = '0';
	prevBtn.style.border = 'none';
	prevBtn.style.background = 'transparent';
	prevBtn.style.display = 'flex';
	prevBtn.style.alignItems = 'center';
	prevBtn.style.justifyContent = 'center';
	prevBtn.style.fontSize = '8px';
	prevBtn.style.cursor = 'pointer';
	prevBtn.style.color = 'var(--text-muted)';
	prevBtn.setText('▲');
	prevBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		onStep(-1);
	});

	const nextBtn = stepper.createEl('button');
	nextBtn.style.flex = '1';
	nextBtn.style.padding = '0';
	nextBtn.style.border = 'none';
	nextBtn.style.borderTop = '1px solid var(--background-modifier-border)';
	nextBtn.style.background = 'transparent';
	nextBtn.style.display = 'flex';
	nextBtn.style.alignItems = 'center';
	nextBtn.style.justifyContent = 'center';
	nextBtn.style.fontSize = '8px';
	nextBtn.style.cursor = 'pointer';
	nextBtn.style.color = 'var(--text-muted)';
	nextBtn.setText('▼');
	nextBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		onStep(1);
	});

	return {
		container: roller,
		update: (selected, index) => {
			const isCurrent = selected.lamport === versions[0]?.lamport;
			const badge = isCurrent ? ` ${currentBadgeText}` : '';
			labelEl.textContent = `${label(selected)}${badge}`;
			labelEl.style.transition = 'opacity 0.15s ease';
			labelEl.style.opacity = '0.5';
			setTimeout(() => {
				labelEl.style.opacity = '1';
			}, 50);

			if (index !== -1) {
				countEl.textContent = `${index + 1}/${versions.length}`;
				selectEl.selectedIndex = index;
			}

			const prevDisabled = index <= 0;
			prevBtn.disabled = prevDisabled;
			prevBtn.style.opacity = prevDisabled ? '0.3' : '1';
			prevBtn.style.cursor = prevDisabled ? 'default' : 'pointer';

			const nextDisabled = index === -1 || index >= versions.length - 1;
			nextBtn.disabled = nextDisabled;
			nextBtn.style.opacity = nextDisabled ? '0.3' : '1';
			nextBtn.style.cursor = nextDisabled ? 'default' : 'pointer';
		},
	};
}
