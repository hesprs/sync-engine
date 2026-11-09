/**
 * Tracks whether a local sync changed the remote state since the last published pulse, and which
 * keys changed. Peers use the key list to patch their cached remote snapshot; a pulse that exceeds
 * the size budget degrades to a keyless one and peers fall back to a full remote walk.
 */
export default class RemoteStateCache {
	private readonly dirty = new Set<string>();
	private readonly revisions = new Map<string, number>();
	private readonly changed = new Map<string, Set<string>>();

	private addChanged(uid: string, key: string): void {
		if (key === '/') return;
		let keys = this.changed.get(uid);
		if (!keys) {
			keys = new Set<string>();
			this.changed.set(uid, keys);
		}
		keys.add(key);
	}

	private markDirty(uid: string): void {
		this.revisions.set(uid, (this.revisions.get(uid) ?? 0) + 1);
		this.dirty.add(uid);
	}

	clear(uid: string): void {
		this.dirty.delete(uid);
		this.revisions.delete(uid);
		this.changed.delete(uid);
	}

	clearAll(): void {
		this.dirty.clear();
		this.revisions.clear();
		this.changed.clear();
	}

	onWrite(uid: string, key: string): void {
		this.markDirty(uid);
		this.addChanged(uid, key);
	}

	onMkdir(uid: string, key: string): void {
		this.markDirty(uid);
		this.addChanged(uid, key);
	}

	onDelete(uid: string, key: string): void {
		this.markDirty(uid);
		this.addChanged(uid, key);
	}

	onMove(uid: string, oldKey: string, newKey: string): void {
		this.markDirty(uid);
		this.addChanged(uid, oldKey);
		this.addChanged(uid, newKey);
	}

	getRevision(uid: string): number {
		return this.revisions.get(uid) ?? 0;
	}

	isDirty(uid: string): boolean {
		return this.dirty.has(uid);
	}

	/** Returns the accumulated changed keys, or `undefined` when there are none. */
	takeChanged(uid: string): Array<string> | undefined {
		const keys = this.changed.get(uid);
		if (!keys || keys.size === 0) return undefined;
		return [...keys].sort();
	}

	/** Clears dirty only if no newer write arrived while the pulse was being published. */
	clearDirty(uid: string, revision?: number): void {
		if (revision !== undefined && this.getRevision(uid) > revision) return;
		this.dirty.delete(uid);
		this.changed.delete(uid);
	}
}
