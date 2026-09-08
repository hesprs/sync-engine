/*
 * URL: https://github.com/cubicdaiya/onp
 *
 * Copyright (c) 2013 Tatsuhiko Kubo <cubicdaiya@gmail.com>
 * Copyright (c) 2016, 2022 Axosoft, LLC (www.gitkraken.com)
 * Copyright (c) 2026, Hēsperus
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the "Software"), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

/**
 * The algorithm implemented here is based on "An O(NP) Sequence Comparison Algorithm"
 * described by Sun Wu, Udi Manber and Gene Myers.
 */

export type DiffHunk = {
	file1: [number, number];
	file2: [number, number];
};

type PathEntry = {
	endX: number;
	endY: number;
	r: number;
	startX: number;
	startY: number;
};

export default class Onp<T> {
	private m: number;
	private n: number;
	private offset: number;
	private path: Array<number> = [];
	private pathPositions: Array<PathEntry> = [];
	private reverse = false;

	constructor(
		private a: ReadonlyArray<T>,
		private b: ReadonlyArray<T>,
	) {
		this.m = a.length;
		this.n = b.length;
		this.offset = this.m + 1;
		this.init();
	}

	compose(): Array<DiffHunk> {
		const delta = this.n - this.m;
		const size = this.m + this.n + 3;
		const fp: Record<number, number> = {};
		this.path = [];
		this.pathPositions = [];

		for (let i = 0; i < size; ++i) {
			fp[i] = -1;
			this.path[i] = -1;
		}

		let p = -1;
		do {
			++p;
			for (let k = -p; k <= delta - 1; ++k)
				fp[k + this.offset] = this.snake(
					k,
					(fp[k - 1 + this.offset] ?? -1) + 1,
					fp[k + 1 + this.offset] ?? -1,
				);

			for (let k = delta + p; k >= delta + 1; --k)
				fp[k + this.offset] = this.snake(
					k,
					(fp[k - 1 + this.offset] ?? -1) + 1,
					fp[k + 1 + this.offset] ?? -1,
				);

			fp[delta + this.offset] = this.snake(
				delta,
				(fp[delta - 1 + this.offset] ?? -1) + 1,
				fp[delta + 1 + this.offset] ?? -1,
			);
		} while (fp[delta + this.offset] !== this.n);

		let r = this.path[delta + this.offset] ?? -1;
		let lastStartX = this.m;
		let lastStartY = this.n;
		const result: Array<DiffHunk> = [];

		while (r !== -1) {
			const elem = this.pathPositions[r];
			if (!elem) throw new Error('Invalid ONP path state');

			if (this.m !== elem.endX || this.n !== elem.endY)
				result.push({
					file1: [
						this.reverse ? elem.endY : elem.endX,
						this.reverse ? lastStartY - elem.endY : lastStartX - elem.endX,
					],
					file2: [
						this.reverse ? elem.endX : elem.endY,
						this.reverse ? lastStartX - elem.endX : lastStartY - elem.endY,
					],
				});

			lastStartX = elem.startX;
			lastStartY = elem.startY;

			r = elem.r;
		}

		if (lastStartX !== 0 || lastStartY !== 0)
			result.push({
				file1: [0, this.reverse ? lastStartY : lastStartX],
				file2: [0, this.reverse ? lastStartX : lastStartY],
			});

		result.reverse();
		return result;
	}

	private init(): void {
		if (this.m < this.n) return;

		const a = this.a;
		const m = this.m;
		this.a = this.b;
		this.b = a;
		this.m = this.n;
		this.n = m;
		this.reverse = true;
		this.offset = this.m + 1;
	}

	private snake(k: number, p: number, pp: number): number {
		const r =
			p > pp
				? (this.path[k - 1 + this.offset] ?? -1)
				: (this.path[k + 1 + this.offset] ?? -1);

		let y = Math.max(p, pp);
		let x = y - k;
		const startX = x;
		const startY = y;

		while (x < this.m && y < this.n && this.a[x] === this.b[y]) {
			++x;
			++y;
		}

		if (startX === x && startY === y) this.path[k + this.offset] = r;
		else {
			this.path[k + this.offset] = this.pathPositions.length;
			this.pathPositions.push({
				endX: x,
				endY: y,
				r,
				startX,
				startY,
			});
		}

		return y;
	}
}
