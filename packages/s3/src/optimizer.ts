import S3Fs from '@/s3/fs';
import { digOriginal } from '@hesprs/sync-engine-sdk';
import { toError } from '@repo/shared/error';
import type {
	DeleteAtom,
	MoveAtom,
	OptimizerInput,
	OptimizerOutput,
} from '@hesprs/sync-engine-sdk';

export default function s3BatchDeleteOptimizer({
	atoms,
	fs,
}: OptimizerInput): OptimizerOutput | undefined {
	const original = digOriginal(fs);
	if (!(original instanceof S3Fs)) return;
	const deleteAtoms: Array<DeleteAtom> = [];
	const moveAtoms: Array<MoveAtom> = [];
	const result: OptimizerOutput = [];
	for (const atom of atoms) {
		const { type } = atom;
		if (type === 'delete') deleteAtoms.push(atom);
		else if (type === 'move') moveAtoms.push(atom);
		else result.push(atom);
	}
	if (deleteAtoms.length <= 1 && moveAtoms.length <= 1) return atoms;
	const batchExecute = async (
		type: 'move' | 'delete',
		targetAtoms: Array<MoveAtom | DeleteAtom>,
	) => {
		try {
			const res = await (type === 'delete'
				? original.batchDelete(deleteAtoms.map(({ key }) => key))
				: original.batchMove(moveAtoms));
			targetAtoms.forEach((atom) => {
				const status = res[atom.type === 'delete' ? atom.key : atom.oldKey];
				if (status) atom.reject(status);
				else atom.resolve();
			});
		} catch (error) {
			const reason = toError(error);
			targetAtoms.forEach((atom) => atom.reject(reason));
		}
	};
	if (deleteAtoms.length > 1)
		result.push({
			execute: () => batchExecute('delete', deleteAtoms),
			type: 'custom' as const,
		});
	if (moveAtoms.length > 1)
		result.push({ execute: () => batchExecute('move', moveAtoms), type: 'custom' as const });
	return result;
}
