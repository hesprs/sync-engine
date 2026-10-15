import type { Fs, InputAtom, Stat } from '@hesprs/sync-engine-sdk';
import { dirname } from '@repo/shared/path';

type PendingUpload = {
	finish: () => void;
	listing: Promise<Array<Stat>>;
};

/** Coordinates shared LIST results within the existing optimizer's upload batches. */
export default class UploadListings {
	private readonly pendingByRemoteKey = new Map<string, PendingUpload>();
	private readonly remoteKeyByTaskKey = new Map<string, string>();
	private readonly finishedBeforeBatch = new Set<string>();
	private cancelled = false;

	constructor(private readonly fs: Pick<Fs, 'list'>) {}

	observeRead(taskKey: string, remoteKey: string) {
		// Optimization probes preserve the task key while wrappers transform the remote key.
		this.remoteKeyByTaskKey.set(taskKey, remoteKey);
		this.finishedBeforeBatch.delete(remoteKey);
	}

	prepare(atoms: Array<InputAtom>) {
		if (this.cancelled) return;
		const groups = new Map<string, Array<string>>();
		for (const atom of atoms) {
			if (atom.type !== 'write') continue;
			// A source read can finish without writing before the optimizer flushes.
			if (this.finishedBeforeBatch.delete(atom.key)) continue;
			const parent = dirname(atom.key);
			const keys = groups.get(parent) ?? [];
			keys.push(atom.key);
			groups.set(parent, keys);
		}
		for (const [parent, keys] of groups) if (keys.length > 1) this.prepareGroup(parent, keys);
	}

	finishWrite(remoteKey: string) {
		const pending = this.pendingByRemoteKey.get(remoteKey);
		pending?.finish();
		return pending?.listing;
	}

	finishTask(taskKey: string) {
		const remoteKey = this.remoteKeyByTaskKey.get(taskKey);
		this.remoteKeyByTaskKey.delete(taskKey);
		if (remoteKey === undefined) return;
		const pending = this.pendingByRemoteKey.get(remoteKey);
		if (pending) pending.finish();
		else this.finishedBeforeBatch.add(remoteKey);
	}

	cancel() {
		this.cancelled = true;
		for (const pending of this.pendingByRemoteKey.values()) pending.finish();
	}

	private prepareGroup(parent: string, keys: Array<string>) {
		let remaining = keys.length;
		let complete: () => void;
		const ready = new Promise<void>((resolve) => {
			complete = resolve;
		});
		const requestedKeys = new Set(keys);
		const listing = ready.then(() =>
			this.fs.list(parent, ({ current }) =>
				requestedKeys.has(current) ? 'include' : 'exclude',
			),
		);
		// Observe failures when no upload succeeded; callers still await the original promise.
		void listing.catch(() => {});
		for (const remoteKey of keys) {
			const finish = () => {
				// Upload completion and task events may both finish the same key.
				if (!this.pendingByRemoteKey.delete(remoteKey)) return;
				remaining -= 1;
				if (remaining === 0) complete();
			};
			this.pendingByRemoteKey.set(remoteKey, { finish, listing });
		}
	}
}
