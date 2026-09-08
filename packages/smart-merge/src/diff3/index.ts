// Copyright (c) 2006, 2008 Tony Garnock-Jones <tonyg@lshift.net>
// Copyright (c) 2006, 2008 LShift Ltd. <query@lshift.net>
// Copyright (c) 2016, 2022 Axosoft, LLC (www.gitkraken.com)
// Copyright (c) 2026, Hēsperus
//
// Permission is hereby granted, free of charge, to any person
// Obtaining a copy of this software and associated documentation files
// (the "Software"), to deal in the Software without restriction,
// Including without limitation the rights to use, copy, modify, merge,
// Publish, distribute, sublicense, and/or sell copies of the Software,
// And to permit persons to whom the Software is furnished to do so,
// Subject to the following conditions:
//
// The above copyright notice and this permission notice shall be
// Included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
// BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import type { DiffHunk } from './onp';
import Onp from './onp';

export type Conflict<T> = {
	a: Array<T>;
	o: Array<T>;
	b: Array<T>;
};

export type MergeChunk<T> =
	| { type: 'ok'; merged: Array<T>; a: Array<T>; o: Array<T>; b: Array<T> }
	| { type: 'conflict'; a: Array<T>; o: Array<T>; b: Array<T> };

export type DiffResult<T> = MergeChunk<T>;

export type DiffCommonResult<T> =
	| { type: 'common'; common: Array<T> }
	| { type: 'diff'; a: Array<T>; b: Array<T> };

type Side = 0 | 1 | 2;
type ChangedSide = 0 | 2;
type Hunk = {
	side: ChangedSide;
	a: Span;
	o: Span;
	b: Span;
};
type Region = [
	changedStart: number,
	changedEnd: number,
	originalStart: number,
	originalEnd: number,
];
type Span = [offset: number, length: number];

function spanEnd(span: Span): number {
	return span[0] + span[1];
}

function areSameOffsetInsertions(a: Hunk, b: Hunk): boolean {
	return a.o[1] === 0 && b.o[1] === 0 && a.o[0] === b.o[0] && a.side !== b.side;
}

function hunkFromDiff(hunk: DiffHunk, side: ChangedSide): Hunk {
	return {
		a: side === 0 ? hunk.file2 : hunk.file1,
		b: side === 2 ? hunk.file2 : hunk.file1,
		o: hunk.file1,
		side,
	};
}

function includeHunk(region: Region, hunk: Hunk): void {
	const changed = hunk.side === 0 ? hunk.a : hunk.b;
	region[0] = Math.min(region[0], changed[0]);
	region[1] = Math.max(region[1], spanEnd(changed));
	region[2] = Math.min(region[2], hunk.o[0]);
	region[3] = Math.max(region[3], spanEnd(hunk.o));
}

function spanForRegion(region: Region, originalStart: number, originalEnd: number): Span {
	const start = region[0] + originalStart - region[2];
	return [start, region[1] + originalEnd - region[3] - start];
}

type MergeIndex =
	| {
			type: 'ok';
			mergedSide: Side;
			a: Span;
			o: Span;
			b: Span;
	  }
	| {
			type: 'conflict';
			a: Span;
			o: Span;
			b: Span;
	  };
type ConflictIndex = Extract<MergeIndex, { type: 'conflict' }>;

function diff3MergeIndices<T>(
	a: ReadonlyArray<T>,
	o: ReadonlyArray<T>,
	b: ReadonlyArray<T>,
): Array<MergeIndex> {
	// Given three files, A, O, and B, where both A and B are
	// Independently derived from O, returns a fairly complicated
	// Internal representation of merge decisions it's taken. The
	// Interested reader may wish to consult
	//
	// Sanjeev Khanna, Keshav Kunal, and Benjamin C. Pierce. "A
	// Formal Investigation of Diff3." In Arvind and Prasad,
	// Editors, Foundations of Software Technology and Theoretical
	// Computer Science (FSTTCS), December 2007.
	//
	// (http://www.cis.upenn.edu/~bcpierce/papers/diff3-short.pdf)
	const hunks = [
		...new Onp(o, a).compose().map((hunk) => hunkFromDiff(hunk, 0)),
		...new Onp(o, b).compose().map((hunk) => hunkFromDiff(hunk, 2)),
	];
	hunks.sort((x, y) => x.o[0] - y.o[0]);

	const result: Array<MergeIndex> = [];
	let aOffset = 0;
	let oOffset = 0;
	let bOffset = 0;

	function pushOk(mergedSide: Side, aLength: number, oLength: number, bLength: number): void {
		result.push({
			a: [aOffset, aLength],
			b: [bOffset, bLength],
			mergedSide,
			o: [oOffset, oLength],
			type: 'ok',
		});
		aOffset += aLength;
		oOffset += oLength;
		bOffset += bLength;
	}

	function copyCommon(targetOffset: number): void {
		if (targetOffset > oOffset) {
			const length = targetOffset - oOffset;
			pushOk(1, length, length, length);
		}
	}

	function pushHunk(hunk: Hunk): void {
		pushOk(
			hunk.side,
			hunk.side === 0 ? hunk.a[1] : hunk.o[1],
			hunk.o[1],
			hunk.side === 2 ? hunk.b[1] : hunk.o[1],
		);
	}

	function pushSameOffsetInsertionConflict(lhs: Hunk, rhs: Hunk): void {
		const aHunk = lhs.side === 0 ? lhs : rhs;
		const bHunk = lhs.side === 2 ? lhs : rhs;
		result.push({
			a: [aOffset, aHunk.a[1]],
			b: [bOffset, bHunk.b[1]],
			o: [oOffset, 0],
			type: 'conflict',
		});
		aOffset += aHunk.a[1];
		bOffset += bHunk.b[1];
	}

	function pushConflict(
		firstHunkIndex: number,
		lastHunkIndex: number,
		lhs: number,
		rhs: number,
	): void {
		const regions: Record<ChangedSide, Region> = {
			0: [a.length, -1, o.length, -1],
			2: [b.length, -1, o.length, -1],
		};
		for (let i = firstHunkIndex; i <= lastHunkIndex; i++)
			includeHunk(regions[hunks[i].side], hunks[i]);

		const aSpan = spanForRegion(regions[0], lhs, rhs);
		const oSpan: Span = [lhs, rhs - lhs];
		const bSpan = spanForRegion(regions[2], lhs, rhs);
		result.push({ a: aSpan, b: bSpan, o: oSpan, type: 'conflict' });
		aOffset = spanEnd(aSpan);
		oOffset = spanEnd(oSpan);
		bOffset = spanEnd(bSpan);
	}

	for (let hunkIndex = 0; hunkIndex < hunks.length; hunkIndex++) {
		const firstHunkIndex = hunkIndex;
		const hunk = hunks[hunkIndex];
		const regionLhs = hunk.o[0];
		let regionRhs = spanEnd(hunk.o);
		if (hunks[hunkIndex + 1] && areSameOffsetInsertions(hunk, hunks[hunkIndex + 1])) {
			copyCommon(regionLhs);
			pushSameOffsetInsertionConflict(hunk, hunks[hunkIndex + 1]);
			hunkIndex++;
			continue;
		}
		while (hunkIndex < hunks.length - 1) {
			const nextHunk = hunks[hunkIndex + 1];
			if (nextHunk.o[0] >= regionRhs) break;
			regionRhs = Math.max(regionRhs, spanEnd(nextHunk.o));
			hunkIndex++;
		}

		copyCommon(regionLhs);
		if (firstHunkIndex === hunkIndex) pushHunk(hunk);
		else pushConflict(firstHunkIndex, hunkIndex, regionLhs, regionRhs);
	}

	copyCommon(o.length);
	return result;
}

export function diffMerge<T>(
	a: ReadonlyArray<T>,
	o: ReadonlyArray<T>,
	b: ReadonlyArray<T>,
): Array<MergeChunk<T>> {
	// Applies the output of diff3MergeIndices to actually
	// Construct the merged file; the returned result alternates
	// Between "ok" and "conflict" blocks.
	const result: Array<MergeChunk<T>> = [];
	const indices = diff3MergeIndices(a, o, b);

	function slice(file: ReadonlyArray<T>, span: Span): Array<T> {
		return file.slice(span[0], span[0] + span[1]);
	}

	function isTrueConflict(rec: ConflictIndex): boolean {
		if (rec.a[1] !== rec.b[1]) return true;
		for (let i = 0; i < rec.a[1]; i++) if (a[rec.a[0] + i] !== b[rec.b[0] + i]) return true;

		return false;
	}

	function pushChunk(chunk: MergeChunk<T>): void {
		const previous = result.at(-1);
		if (previous?.type === 'conflict' && chunk.type === 'conflict') {
			previous.a.push(...chunk.a);
			previous.o.push(...chunk.o);
			previous.b.push(...chunk.b);
			return;
		}
		result.push(chunk);
	}

	// oxlint-disable-next-line max-params
	function pushOk(
		aSpan: Span,
		oSpan: Span,
		bSpan: Span,
		mergedFile: ReadonlyArray<T>,
		mergedSpan: Span,
	): void {
		pushChunk({
			a: slice(a, aSpan),
			b: slice(b, bSpan),
			merged: slice(mergedFile, mergedSpan),
			o: slice(o, oSpan),
			type: 'ok',
		});
	}

	function sharedEdgeLength(x: ConflictIndex, skip: number, fromEnd: boolean): number {
		const limit = Math.min(x.a[1], x.b[1]) - skip;
		let length = 0;
		while (
			length < limit &&
			a[fromEnd ? spanEnd(x.a) - length - 1 : x.a[0] + length] ===
				b[fromEnd ? spanEnd(x.b) - length - 1 : x.b[0] + length]
		)
			length++;
		return length;
	}

	function pushConflictChunk(x: ConflictIndex): void {
		const aLength = x.a[1];
		const bLength = x.b[1];
		const prefixLength = sharedEdgeLength(x, 0, false);
		const suffixLength = sharedEdgeLength(x, prefixLength, true);

		if (x.o[1] === 0 && prefixLength === 0 && suffixLength === 0) {
			if (aLength > 0) pushOk(x.a, [0, 0], [0, 0], a, x.a);

			if (bLength > 0) pushOk([0, 0], [0, 0], x.b, b, x.b);

			return;
		}

		const prefix: Span = [x.a[0], prefixLength];
		if (prefixLength > 0) pushOk(prefix, [0, 0], [x.b[0], prefixLength], a, prefix);

		const conflict = {
			a: [x.a[0] + prefixLength, aLength - prefixLength - suffixLength],
			b: [x.b[0] + prefixLength, bLength - prefixLength - suffixLength],
			o: x.o,
			type: 'conflict',
		} satisfies ConflictIndex;

		if (conflict.a[1] > 0 || conflict.o[1] > 0 || conflict.b[1] > 0)
			if (isTrueConflict(conflict))
				pushChunk({
					a: slice(a, conflict.a),
					b: slice(b, conflict.b),
					o: slice(o, conflict.o),
					type: 'conflict',
				});
			else pushOk(conflict.a, conflict.o, conflict.b, a, conflict.a);

		const suffix: Span = [x.a[0] + aLength - suffixLength, suffixLength];
		if (suffixLength > 0)
			pushOk(suffix, [0, 0], [x.b[0] + bLength - suffixLength, suffixLength], a, suffix);
	}

	for (const x of indices)
		if (x.type === 'conflict') pushConflictChunk(x);
		else {
			const mergedSpan = x.mergedSide === 0 ? x.a : x.mergedSide === 1 ? x.o : x.b;
			const mergedFile = x.mergedSide === 0 ? a : x.mergedSide === 1 ? o : b;
			pushOk(x.a, x.o, x.b, mergedFile, mergedSpan);
		}

	return result;
}
