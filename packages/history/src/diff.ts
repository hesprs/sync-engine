import Onp from '@repo/shared/onp';

export type DiffLine = { text: string; type: 'added' | 'removed' | 'unchanged' };

export function computeLineDiff(historical: string, current: string): Array<DiffLine> {
	const cleanHist = historical.replaceAll('\r\n', '\n');
	const cleanCurr = current.replaceAll('\r\n', '\n');
	const a = cleanHist ? cleanHist.split('\n') : [];
	const b = cleanCurr ? cleanCurr.split('\n') : [];
	const hunks = new Onp(a, b).compose();
	const lines: Array<DiffLine> = [];
	let curA = 0;
	let curB = 0;
	for (const hunk of hunks) {
		const [startA, lenA] = hunk.file1;
		const [startB, lenB] = hunk.file2;
		while (curA < startA && curB < startB) {
			lines.push({ text: a[curA], type: 'unchanged' });
			curA++;
			curB++;
		}
		for (let i = 0; i < lenA; i++) lines.push({ text: a[startA + i], type: 'removed' });
		for (let i = 0; i < lenB; i++) lines.push({ text: b[startB + i], type: 'added' });
		curA = startA + lenA;
		curB = startB + lenB;
	}
	while (curA < a.length && curB < b.length) {
		lines.push({ text: a[curA], type: 'unchanged' });
		curA++;
		curB++;
	}
	return lines;
}

export function renderDiffLines(previewEl: HTMLElement, diffLines: Array<DiffLine>): void {
	for (const line of diffLines) {
		const row = previewEl.createEl('div');
		row.style.display = 'flex';
		row.style.alignItems = 'flex-start';
		row.style.padding = '2px 10px';
		row.style.fontFamily = 'var(--font-monospace, monospace)';
		row.style.fontSize = '12px';
		row.style.lineHeight = '1.6';
		row.style.whiteSpace = 'pre-wrap';
		row.style.wordBreak = 'break-word';

		const sign = row.createSpan();
		sign.style.width = '18px';
		sign.style.flexShrink = '0';
		sign.style.userSelect = 'none';
		sign.style.fontWeight = 'bold';

		const textSpan = row.createSpan();
		textSpan.style.flex = '1';
		textSpan.style.whiteSpace = 'pre-wrap';
		textSpan.style.wordBreak = 'break-word';
		textSpan.style.color = 'var(--text-normal)';
		textSpan.setText(line.text);

		if (line.type === 'added') {
			row.style.backgroundColor = 'rgba(46, 160, 67, 0.15)';
			row.style.borderLeft = '3px solid var(--text-success, #2ea043)';
			sign.style.color = 'var(--text-success, #2ea043)';
			sign.setText('+');
		} else if (line.type === 'removed') {
			row.style.backgroundColor = 'rgba(248, 81, 73, 0.15)';
			row.style.borderLeft = '3px solid var(--text-error, #f85149)';
			sign.style.color = 'var(--text-error, #f85149)';
			sign.setText('-');
		} else {
			row.style.backgroundColor = 'transparent';
			row.style.borderLeft = '3px solid transparent';
			sign.style.color = 'var(--text-muted, #8b949e)';
			sign.setText(' ');
		}
	}
}
