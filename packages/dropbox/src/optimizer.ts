import DropboxFs from '@/dropbox/fs';
import { digOriginal } from '@hesprs/sync-engine-sdk';
import { toError } from '@repo/shared/error';
import { dirname, isSub } from '@repo/shared/path';
import type {
	CustomAtom,
	DeleteAtom,
	InputAtom,
	MkdirAtom,
	MoveAtom,
	OptimizerInput,
	OptimizerOutput,
	OutputAtom,
	WriteAtom,
} from '@hesprs/sync-engine-sdk';

type Paths = { read?: string; write?: string };
type Subsumable = DeleteAtom | MoveAtom;
type BatchMember = DeleteAtom | MkdirAtom | MoveAtom;
type BatchGroup = {
	atom: CustomAtom;
	members: Array<BatchMember>;
	run: () => Promise<Record<string, Error>>;
};

function pathsOf(atom: InputAtom): Paths {
	if (atom.type === 'delete') return { read: atom.key };
	if (atom.type === 'move') return { read: atom.oldKey, write: atom.newKey };
	return { write: atom.key };
}

function isSubsumable(atom: InputAtom): atom is Subsumable {
	return atom.type === 'delete' || atom.type === 'move';
}

/** Whether two moves would collide inside one `move_batch_v2` call. */
function movesConflict(first: MoveAtom, second: MoveAtom): boolean {
	const paths = [first.oldKey.toLowerCase(), first.newKey.toLowerCase()];
	const others = [second.oldKey.toLowerCase(), second.newKey.toLowerCase()];
	return paths.some((path) =>
		others.some((other) => isSub(path, other, true) || isSub(other, path, true)),
	);
}

/** Minimum write count for a flush to upload through batched sessions. */
const MIN_BATCHED_WRITES = 4;
/** Ready sessions committed per finish_batch_v2 request. */
const COMMIT_CHUNK = 50;

/**
 * Wires a flush of four or more writes into one session set: every write waits for the start atom
 * first, and each write counts itself when its upload finishes (the fs callback) or when it settles
 * (a failure). Commits run one at a time in COMMIT_CHUNK-sized requests, and one final key-less
 * commit runs once every write is counted.
 */
function setupUploadSessions(
	original: DropboxFs,
	dependencies: Map<InputAtom, Set<OutputAtom>>,
	writes: Array<WriteAtom>,
): { notifyWriteSettled: (key: string) => void; startAtom: CustomAtom } | undefined {
	if (writes.length < MIN_BATCHED_WRITES) return;
	const startAtom: CustomAtom = {
		execute: () => original.startUploadSessions(writes.map(({ key }) => key)),
		type: 'custom',
	};
	for (const atom of writes) dependencies.get(atom)?.add(startAtom);

	const counted = new Set<string>();
	const ready: Array<string> = [];
	let countedAll = false;
	let committing = false;
	const count = (key: string) => {
		counted.add(key);
		if (counted.size !== writes.length || countedAll) return;
		countedAll = true;
		original.clearCommitReadyCallback();
	};
	const commit = async () => {
		if (committing) return;
		committing = true;
		try {
			while (ready.length >= COMMIT_CHUNK)
				await original.finishUploadSessions(ready.splice(0, COMMIT_CHUNK));
			if (countedAll) await original.finishUploadSessions();
		} finally {
			committing = false;
		}
	};
	original.setCommitReadyCallback((key) => {
		count(key);
		ready.push(key);
		void commit();
	});
	return {
		notifyWriteSettled: (key) => {
			count(key);
			void commit();
		},
		startAtom,
	};
}

/**
 * Replaces the hierarchical optimizer for Dropbox batches: keeps its umbrella subsumption and
 * dependency semantics while collapsing non-subsumed deletes, moves, and folder creations into
 * batch API calls. Returns `undefined` for other file systems.
 *
 * Batch groups never wait on themselves: the decider emits at most one task per key, so a group
 * member can only depend on atoms outside its group, or on its own group's mkdir ancestors (which
 * the group's server-side batch calls create together).
 */
export default function dropboxOptimizer({
	atoms,
	executeAtom,
	fs,
}: OptimizerInput): OptimizerOutput | undefined {
	const original = digOriginal(fs);
	if (!(original instanceof DropboxFs)) return;

	const dependencies = new Map(atoms.map((atom) => [atom, new Set<OutputAtom>()]));
	const umbrellas = new Map<Subsumable, Subsumable>();

	for (const atom of atoms)
		if (atom.type === 'move') {
			let umbrella: MoveAtom | undefined;
			for (const candidate of atoms) {
				if (
					candidate.type !== 'move' ||
					!isSub(candidate.oldKey, atom.oldKey) ||
					atom.newKey !==
						`${candidate.newKey}${atom.oldKey.slice(candidate.oldKey.length)}`
				)
					continue;
				if (!umbrella || candidate.oldKey.length < umbrella.oldKey.length)
					umbrella = candidate;
			}
			if (umbrella) umbrellas.set(atom, umbrella);
		} else if (atom.type === 'delete') {
			let umbrella: DeleteAtom | undefined;
			for (const candidate of atoms) {
				if (
					candidate.type !== 'delete' ||
					!isSub(candidate.key, atom.key) ||
					(umbrella && candidate.key.length <= umbrella.key.length)
				)
					continue;
				umbrella = candidate;
			}
			if (umbrella) umbrellas.set(atom, umbrella);
		}

	const creators = new Map<string, InputAtom>();
	for (const atom of atoms) {
		const { write } = pathsOf(atom);
		if (write) creators.set(write, atom);
	}
	for (const atom of atoms) {
		const { write } = pathsOf(atom);
		if (!write) continue;
		for (let parent = dirname(write); parent !== '/'; parent = dirname(parent)) {
			const creator = creators.get(parent);
			if (!creator || creator === atom) continue;
			dependencies.get(atom)?.add(creator);
			break;
		}
	}

	for (const move of atoms) {
		if (move.type !== 'move' || umbrellas.has(move)) continue;
		for (const atom of atoms) {
			if (atom === move || (isSubsumable(atom) && umbrellas.has(atom))) continue;
			const { read, write } = pathsOf(atom);
			if ((read && isSub(move.newKey, read)) || (write && isSub(move.newKey, write)))
				dependencies.get(atom)?.add(move);
		}
	}

	for (const deletion of atoms) {
		if (deletion.type !== 'delete') continue;
		for (const atom of atoms) {
			const { write } = pathsOf(atom);
			if (write && (`${deletion.key}/` === write || `${write}/` === deletion.key))
				dependencies.get(atom)?.add(deletion);
			if (atom.type === 'move' && isSub(deletion.key, atom.oldKey))
				dependencies.get(deletion)?.add(atom);
		}
	}

	const subsumed = new Set<Subsumable>(umbrellas.keys());
	const groups: Array<BatchGroup> = [];
	const memberToBatch = new Map<OutputAtom, CustomAtom>();
	const collect = (members: Array<BatchMember>, run: () => Promise<Record<string, Error>>) => {
		if (members.length <= 1) return;
		const atom: CustomAtom = { execute: () => Promise.resolve(), type: 'custom' };
		groups.push({ atom, members, run });
		for (const member of members) memberToBatch.set(member, atom);
	};

	const deletes = atoms.filter(
		(atom): atom is DeleteAtom => atom.type === 'delete' && !subsumed.has(atom),
	);
	collect(deletes, () => original.batchDelete(deletes.map(({ key }) => key)));

	const moveGroup: Array<MoveAtom> = [];
	for (const move of atoms) {
		if (move.type !== 'move' || subsumed.has(move)) continue;
		if (moveGroup.some((member) => movesConflict(member, move))) continue;
		moveGroup.push(move);
	}
	collect(moveGroup, () => original.batchMove(moveGroup));

	const mkdirs = atoms.filter((atom): atom is MkdirAtom => atom.type === 'mkdir');
	collect(mkdirs, () => original.batchMkdir(mkdirs.map(({ key }) => key)));

	const translate = (atom: OutputAtom): OutputAtom => memberToBatch.get(atom) ?? atom;

	for (const { atom, members, run } of groups) {
		const groupSet = new Set<OutputAtom>(members);
		const batchDeps = new Set<OutputAtom>();
		for (const member of members)
			for (const dependency of dependencies.get(member) ?? [])
				if (!groupSet.has(dependency)) batchDeps.add(dependency);
		atom.execute = async () => {
			try {
				await Promise.all(
					[...batchDeps].map((dependency) => executeAtom(translate(dependency))),
				);
				const result = await run();
				for (const member of members) {
					const error = result[memberKey(member)];
					if (error) member.reject(error);
					else member.resolve();
				}
			} catch (error) {
				const reason = toError(error);
				for (const member of members) member.reject(reason);
				throw error;
			}
		};
	}

	const writes = atoms.filter((atom): atom is WriteAtom => atom.type === 'write');
	const batching = setupUploadSessions(original, dependencies, writes);

	const output: OptimizerOutput = [];
	for (const atom of atoms) {
		if (memberToBatch.has(atom)) continue;
		const originalExecute = atom.execute;
		atom.execute = (async () => {
			try {
				if (isSubsumable(atom)) {
					const umbrella = umbrellas.get(atom);
					if (umbrella) {
						await executeAtom(translate(umbrella));
						atom.resolve();
						return;
					}
				}
				await Promise.all(
					[...(dependencies.get(atom) ?? [])].map((dependency) =>
						executeAtom(translate(dependency)),
					),
				);
				return await originalExecute();
			} catch (error) {
				atom.reject(toError(error));
				throw error;
			}
		}) as never;
		output.push(atom);
	}
	if (batching) {
		for (const atom of writes) {
			const wrapped = atom.execute;
			atom.execute = async () => {
				try {
					return await wrapped();
				} finally {
					batching.notifyWriteSettled(atom.key);
				}
			};
		}
		output.push(batching.startAtom);
	}
	output.push(...groups.map(({ atom }) => atom));
	return output;
}

function memberKey(member: BatchMember): string {
	return member.type === 'move' ? member.oldKey : member.key;
}
