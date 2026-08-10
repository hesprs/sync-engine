import type { StoreSync } from 'uni-kv';
import { basename, dirname, isFolder, isSub } from '@repo/shared/path';
import type { Stat, Binary, FileStat } from '@/types';
import type { Fs, ListReporter, WrappedFs } from '../interface';

const ROOT_KEY = '/';
const ROOT_ANCHOR = '00000';
const EMPTY_BINARY = new Uint8Array(0);

type ParsedFlatKey =
	| { isDir: false; basename: string; parentAnchor: string }
	| { isDir: true; anchor: string; basename: string; parentAnchor: string };

function isRootKey(key: string) {
	return key === ROOT_KEY;
}

function joinFolderKey(parentKey: string, base: string) {
	return parentKey === ROOT_KEY ? `${base}/` : `${parentKey}${base}/`;
}

function joinFileKey(parentKey: string, base: string) {
	return parentKey === ROOT_KEY ? base : `${parentKey}${base}`;
}

function parseFlattenedKey(key: string): ParsedFlatKey | undefined {
	if (key === ROOT_KEY || key.includes('/')) return undefined;
	if (key.length > 6 && key[5] === '~') {
		const base = key.slice(6);
		if (!base) return;
		return { basename: base, isDir: false, parentAnchor: key.slice(0, 5) };
	}
	if (key.length > 11 && key[10] === '~') {
		const base = key.slice(11);
		if (!base) return;
		return {
			anchor: key.slice(5, 10),
			basename: base,
			isDir: true,
			parentAnchor: key.slice(0, 5),
		};
	}
	return undefined;
}

class AsymmetricStorageFs implements WrappedFs {
	private readonly keyToAnchor = new Map<string, string>([[ROOT_KEY, ROOT_ANCHOR]]);
	private readonly anchorToKey = new Map<string, string>([[ROOT_ANCHOR, ROOT_KEY]]);
	private readonly knownAnchors = new Set<string>([ROOT_ANCHOR]);
	private bootstrapped = false;

	constructor(
		readonly original: Fs,
		private readonly statStore: StoreSync<Stat>,
	) {}

	getUid() {
		return this.original.getUid();
	}

	read(key: string, stat: FileStat) {
		return this.original.read(this.flattenFileKey(key), stat);
	}

	readStream(key: string, stat: FileStat) {
		return this.original.readStream(this.flattenFileKey(key), stat);
	}

	write(key: string, value: Binary, stat: FileStat) {
		return this.original.write(this.flattenFileKey(key), value, stat);
	}

	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		return this.original.writeStream(this.flattenFileKey(key), value, stat);
	}

	async delete(key: string) {
		if (isFolder(key)) {
			const anchor = this.findAnchor(key);
			this.deleteMapping(key, anchor);
			try {
				return await this.original.delete(this.flattenFolderKey(key, anchor));
			} catch (error) {
				this.registerMapping(key, anchor);
				throw error;
			}
		} else return this.original.delete(this.flattenFileKey(key));
	}

	async move(oldKey: string, newKey: string) {
		const bothFolder = isFolder(oldKey) && isFolder(newKey);
		if (bothFolder) {
			const oldAnchor = this.findAnchor(oldKey);
			const flattenedNewKey = this.flattenFolderKey(newKey, oldAnchor);
			const flattenedOldKey = this.flattenFolderKey(oldKey);
			// Avoid deleting keyToAnchor since descendants still need
			this.anchorToKey.delete(oldAnchor);
			this.registerMapping(newKey, oldAnchor);
			if (flattenedOldKey === flattenedNewKey) return;
			try {
				await this.original.move(flattenedOldKey, flattenedNewKey);
			} catch (error) {
				this.deleteMapping(newKey, oldAnchor);
				this.anchorToKey.set(oldAnchor, oldKey);
				throw error;
			}
		} else {
			const flattenedNewKey = this.flattenFileKey(newKey);
			const flattenedOldKey = this.flattenFileKey(oldKey);
			if (flattenedOldKey === flattenedNewKey) return;
			return this.original.move(flattenedOldKey, flattenedNewKey);
		}
	}

	async mkdir(key: string, recursive?: boolean) {
		if (isRootKey(key)) return this.original.mkdir(key, recursive);
		this.bootstrapMaps();
		let anchor = this.keyToAnchor.get(key);
		const created = !anchor;
		if (!anchor) {
			const parentAnchor = this.keyToAnchor.get(dirname(key));
			if (!parentAnchor)
				throw new Error(
					"Parent anchor doesn't exist when generating child's. This is probably a bug of Sync Engine.",
				);
			let source = `${parentAnchor}~${basename(key)}`;
			do anchor = generateId(source);
			while (this.knownAnchors.has(anchor) && (source += '☭'));
			this.registerMapping(key, anchor);
		}
		try {
			const anchoredKey = this.flattenFolderKey(key, anchor);
			await this.original.write(anchoredKey, EMPTY_BINARY, {
				isDir: false,
				key: anchoredKey,
				mtime: 0,
				size: 0,
				uid: crypto.randomUUID(),
			});
		} catch (error) {
			if (created) this.deleteMapping(key, anchor);
			throw error;
		}
	}

	async stat(key: string) {
		if (isRootKey(key)) return this.original.stat(key);
		const stat = await this.original.stat(this.flattenKey(key));
		return this.inflateStat(stat) ?? stat;
	}

	exists(key: string) {
		return this.original.exists(this.flattenKey(key));
	}

	async list(key: string, reporter: ListReporter) {
		const stats = await this.original.list(this.flattenKey(key), () => 'include');
		const seen = new Set<string>();
		const result: Array<Stat> = [];
		let ignoredCount = 0;
		await Promise.all(
			stats.map(async (stat, index) => {
				const inflated = this.inflateStat(stat);
				if (!inflated) {
					ignoredCount++;
					return;
				}
				if (
					!isSub(key, inflated.key) ||
					seen.has(inflated.key) ||
					(await reporter({
						completed: index + 1,
						current: inflated.key,
						total: stats.length,
					})) === 'exclude'
				)
					return;
				seen.add(inflated.key);
				result.push(inflated);
			}),
		);
		if (ignoredCount / (stats.length || 1) >= 0.3)
			throw new Error(
				"There are too many files at remote that don't adopt asymmetric storage, maybe you want to turn it off in settings.",
			);
		return result;
	}

	private flattenKey(key: string) {
		if (isRootKey(key)) return ROOT_KEY;
		return isFolder(key) ? this.flattenFolderKey(key) : this.flattenFileKey(key);
	}

	private flattenFileKey(key: string) {
		const parentAnchor = this.findAnchor(dirname(key));
		return `${parentAnchor}~${basename(key)}`;
	}

	private flattenFolderKey(key: string, folderAnchor = this.findAnchor(key)) {
		const parentAnchor = this.findAnchor(dirname(key));
		return `${parentAnchor}${folderAnchor}~${basename(key)}`;
	}

	private inflateStat(stat: Stat): Stat | undefined {
		if (stat.key === ROOT_KEY) return { isDir: true, key: ROOT_KEY };
		this.bootstrapMaps();
		const parsed = parseFlattenedKey(stat.key);
		if (!parsed) return;
		const parentKey = this.anchorToKey.get(parsed.parentAnchor);
		if (!parentKey) return;
		if (parsed.isDir) {
			const folderKey = joinFolderKey(parentKey, parsed.basename);
			if (!this.registerMapping(folderKey, parsed.anchor)) return;
			return { isDir: true, key: folderKey };
		}
		if (stat.isDir) return;
		return { ...stat, key: joinFileKey(parentKey, parsed.basename) };
	}

	private findAnchor(folderKey: string): string {
		if (isRootKey(folderKey)) return ROOT_ANCHOR;
		this.bootstrapMaps();
		const existing = this.keyToAnchor.get(folderKey);
		if (existing) return existing;
		throw new Error('Cannot find existing anchor, this is probably a bug of Sync Engine.');
	}

	private bootstrapMaps() {
		if (this.bootstrapped) return;
		this.bootstrapped = true;
		const candidates: Array<{ anchor: string; basename: string; parentAnchor: string }> = [];
		for (const stat of this.statStore.values()) {
			const parsed = parseFlattenedKey(stat.key);
			if (parsed?.isDir)
				candidates.push({
					anchor: parsed.anchor,
					basename: parsed.basename,
					parentAnchor: parsed.parentAnchor,
				});
		}
		const pending = new Set(candidates.keys());
		let changed = true;
		while (changed && pending.size > 0) {
			changed = false;
			// oxlint-disable-next-line unicorn/no-useless-spread
			for (const index of [...pending]) {
				const candidate = candidates[index];
				const parentKey = this.anchorToKey.get(candidate.parentAnchor);
				if (!parentKey) continue;
				const folderKey = joinFolderKey(parentKey, candidate.basename);
				this.registerMapping(folderKey, candidate.anchor);
				pending.delete(index);
				changed = true;
			}
		}
	}

	private registerMapping(folderKey: string, anchor: string) {
		const currentAnchor = this.keyToAnchor.get(folderKey);
		if (currentAnchor) return currentAnchor === anchor;
		const currentFolderKey = this.anchorToKey.get(anchor);
		if (currentFolderKey) return currentFolderKey === folderKey;
		this.keyToAnchor.set(folderKey, anchor);
		this.anchorToKey.set(anchor, folderKey);
		this.knownAnchors.add(anchor);
		return true;
	}

	private deleteMapping(folderKey: string, anchor: string) {
		this.keyToAnchor.delete(folderKey);
		this.anchorToKey.delete(anchor);
		this.knownAnchors.delete(anchor);
	}
}

export default function asymmetricStorageWrapper(
	original: Fs,
	options: StoreSync<Stat>,
): WrappedFs {
	return new AsymmetricStorageFs(original, options);
}

const SAFE_81 = " !$'(),-.0123456789;=@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{}";

function generateId(str: string): string {
	let h1 = Math.trunc(0xde_ad_be_ef),
		h2 = Math.trunc(0x41_c6_ce_57);
	for (const char of str) {
		const ch = char.codePointAt(0) as number;
		h1 = Math.imul(h1 ^ ch, 2_654_435_761);
		h2 = Math.imul(h2 ^ ch, 1_597_334_677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2_246_822_507);
	h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3_266_489_909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2_246_822_507);
	h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3_266_489_909);
	// oxlint-disable-next-line unicorn/prefer-math-trunc https://github.com/oxc-project/oxc/issues/25239
	let hash = 4_294_967_296 * (2_097_151 & h2) + (h1 >>> 0);
	const c4 = hash % 81;
	hash = Math.trunc(hash / 81);
	const c3 = hash % 81;
	hash = Math.trunc(hash / 81);
	const c2 = hash % 81;
	hash = Math.trunc(hash / 81);
	const c1 = hash % 81;
	hash = Math.trunc(hash / 81);
	const c0 = hash % 81;
	return SAFE_81[c0] + SAFE_81[c1] + SAFE_81[c2] + SAFE_81[c3] + SAFE_81[c4];
}
