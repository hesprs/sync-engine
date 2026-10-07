import type { DatabaseSync, StoreSync } from 'uni-kv';
import type { MaybePromise, Stat, Binary, FileStat, FolderStat } from '@/types';
import type { WrappedFs, Fs, ListReporter } from '../interface';

type ContextOptions<S extends string, M extends string> = {
	db: DatabaseSync<Record<S, Stat>, Record<M, string>>;
	store: NoInfer<S>;
	marker: NoInfer<M>;
};

function moveCachedStat(store: StoreSync<Stat>, oldKey: string, newKey: string) {
	const stat = store.get(oldKey);
	if (stat === undefined) return;
	store.delete(oldKey);
	store.set(newKey, { ...stat, key: newKey });
}

async function cacheStat(store: StoreSync<Stat>, stat: MaybePromise<Stat>) {
	const resolvedStat = await stat;
	store.set(resolvedStat.key, resolvedStat);
	return resolvedStat;
}

async function replaceStats(store: StoreSync<Stat>, stats: MaybePromise<Array<Stat>>) {
	const resolvedStats = await stats;
	store.clear();
	for (const stat of resolvedStats) store.set(stat.key, stat);
	return resolvedStats;
}

class ContextFs<S extends string, M extends string> implements WrappedFs {
	private readonly store: StoreSync<Stat>;

	constructor(
		readonly original: Fs,
		{ db, marker, store }: ContextOptions<S, M>,
	) {
		const uid = original.getUid();
		this.store = db.getStore(store);
		if (db.getMeta(marker) !== uid) {
			this.store.clear();
			db.setMeta(marker, uid);
		}
	}

	getUid() {
		return this.original.getUid();
	}

	read(key: string, stat: FileStat) {
		return this.original.read(key, stat);
	}

	readStream(key: string, stat: FileStat) {
		return this.original.readStream(key, stat);
	}

	async write(key: string, value: Binary, stat: FileStat) {
		const uid = await this.original.write(key, value, stat);
		this.store.set(key, { ...stat, uid });
		return uid;
	}

	async writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		const uid = await this.original.writeStream(key, value, stat);
		this.store.set(key, { ...stat, uid });
		return uid;
	}

	async delete(key: string) {
		await this.original.delete(key);
		this.store.delete(key);
	}

	async mkdir(key: string, stat: FolderStat, recursive?: boolean) {
		await this.original.mkdir(key, stat, recursive);
		if (key !== '/') this.store.set(key, stat);
	}

	async move(oldKey: string, newKey: string) {
		await this.original.move(oldKey, newKey);
		moveCachedStat(this.store, oldKey, newKey);
	}

	stat(key: string) {
		return cacheStat(this.store, this.original.stat(key));
	}

	exists(key: string) {
		return this.original.exists(key);
	}

	list(key: string, reporter: ListReporter) {
		return replaceStats(this.store, this.original.list(key, reporter));
	}
}

export default function remoteContextWrapper<S extends string, M extends string>(
	original: Fs,
	options: ContextOptions<S, M>,
): WrappedFs {
	return new ContextFs(original, options);
}
