import { diffMerge } from '@/diff3';
import { documentSplitter } from './splitters';

export type MergeSegment = {
	tokens: Array<string>;
	joints: Array<string>;
	splitters: Array<((str: string) => MergeSegment) | undefined>;
};
type MergeSegments = {
	a: MergeSegment;
	b: MergeSegment;
	o: MergeSegment;
};
type SegmentStats = MergeSegment & { index: number };
export type MergeParams = {
	a: string;
	b: string;
	o: string;
};
export type MergeOptions = {
	conflictAEnd: string;
	conflictBEnd: string;
	conflictAStart: string;
	conflictBStart: string;
	deletionStart: string;
	deletionEnd: string;
};

function markConflict(
	a: string | undefined,
	b: string | undefined,
	{
		conflictAEnd,
		conflictAStart,
		conflictBEnd,
		conflictBStart,
		deletionEnd,
		deletionStart,
	}: MergeOptions,
) {
	if (!a) return `${deletionStart}${b}${deletionEnd}`;
	if (!b) return `${deletionStart}${a}${deletionEnd}`;
	return `${conflictAStart}${a}${conflictAEnd}${conflictBStart}${b}${conflictBEnd}`;
}

function judgeJoint({ a, o, b }: { a?: string; o?: string; b?: string }, options: MergeOptions) {
	let joint: string | undefined;
	if (a === b) joint = a;
	else if (o === b) joint = a;
	else if (o === a) joint = b;
	else joint = markConflict(a, b, options);
	return joint ?? '';
}

function toSegments(stats: SegmentStats, conflicts: Array<string>) {
	const { splitters, joints } = stats;
	const segment: MergeSegment = { joints: [], splitters: [], tokens: [] };
	let split = false;
	for (const conflict of conflicts) {
		const splitter = splitters[stats.index];
		if (splitter) {
			split = true;
			const {
				tokens: newTokens,
				splitters: newSplitters,
				joints: newJoints,
			} = splitter(conflict);
			segment.tokens.push(...newTokens);
			segment.splitters.push(...newSplitters);
			segment.joints.push(...newJoints);
		} else {
			segment.tokens.push(conflict);
			segment.splitters.push(splitter);
		}
		segment.joints.push(joints[stats.index]);
		stats.index++;
	}
	return { segment, split };
}

function joinValues(stats: SegmentStats, conflicts: Array<string>) {
	let result = '';
	conflicts.forEach((conflict, index) => {
		if (index === conflicts.length - 1) result += conflict;
		else {
			result += `${conflict}${stats.joints[stats.index]}`;
			stats.index++;
		}
	});
	return result;
}

function mergeRecursive(params: MergeSegments, options: MergeOptions): string {
	let result = '';
	const a: SegmentStats = Object.assign(params.a, { index: 0 });
	const b: SegmentStats = Object.assign(params.b, { index: 0 });
	const o: SegmentStats = Object.assign(params.o, { index: 0 });
	diffMerge(a.tokens, o.tokens, b.tokens).forEach((mergeResult) => {
		const { type, a: chunkA, o: chunkO, b: chunkB } = mergeResult;
		if (type === 'ok') {
			const originalAIndex = a.index;
			const originalOIndex = o.index;
			const originalBIndex = b.index;
			mergeResult.merged.forEach((token, index) => {
				let aJoint: string | undefined;
				let bJoint: string | undefined;
				let oJoint: string | undefined;
				if (chunkA[index]) {
					aJoint = a.joints[a.index];
					a.index++;
				}
				if (chunkB[index]) {
					bJoint = b.joints[b.index];
					b.index++;
				}
				if (chunkO[index]) {
					oJoint = o.joints[o.index];
					o.index++;
				}
				result += `${token}${judgeJoint({ a: aJoint, b: bJoint, o: oJoint }, options)}`;
			});
			a.index = originalAIndex + chunkA.length;
			b.index = originalBIndex + chunkB.length;
			o.index = originalOIndex + chunkO.length;
		} else {
			const { segment: segmentA, split: splitA } = toSegments(a, chunkA);
			const { segment: segmentB, split: splitB } = toSegments(b, chunkB);
			const { segment: segmentO, split: splitO } = toSegments(o, chunkO);
			if (splitA || splitB || splitO) {
				result += mergeRecursive({ a: segmentA, b: segmentB, o: segmentO }, options);
				return;
			}
			a.index -= chunkA.length;
			b.index -= chunkB.length;
			result += `${markConflict(
				joinValues(a, chunkA),
				joinValues(b, chunkB),
				options,
			)}${judgeJoint({ a: a.joints[a.index], b: b.joints[b.index] }, options)}`;
			if (chunkA.length) a.index++;
			if (chunkB.length) b.index++;
		}
	});
	return result;
}

export default function merge(
	{ a, o, b }: { a: string; o: string; b: string },
	options: MergeOptions,
) {
	return mergeRecursive(
		{
			a: documentSplitter(a),
			b: documentSplitter(b),
			o: documentSplitter(o),
		},
		options,
	);
}
