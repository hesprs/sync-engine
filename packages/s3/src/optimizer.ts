import type { DeleteAtom, OptimizerInput, OptimizerOutput } from '@hesprs/sync-engine-sdk';
import { digOriginal } from '@hesprs/sync-engine-sdk';
import { toError } from '@repo/shared/error';
import S3Fs from './s3/fs';

export default function s3BatchDeleteOptimizer({
	atoms,
	fs,
}: OptimizerInput): OptimizerOutput | undefined {
	const original = digOriginal(fs);
	if (!(original instanceof S3Fs)) return;
	const deleteAtoms = atoms.filter((a): a is DeleteAtom => a.type === 'delete');
	if (deleteAtoms.length <= 1) return atoms;
	const otherAtoms = atoms.filter((a) => a.type !== 'delete');
	const batchAtom = {
		execute: async () => {
			const keys = deleteAtoms.map((a) => a.key);
			try {
				const result = await original.batchDelete(keys);
				deleteAtoms.forEach((atom) => {
					const status = result[atom.key];
					if (status) atom.reject(status);
					else atom.resolve();
				});
			} catch (error) {
				const reason = toError(error);
				deleteAtoms.forEach((atom) => atom.reject(reason));
			}
		},
		type: 'custom' as const,
	};
	return [...otherAtoms, batchAtom];
}
