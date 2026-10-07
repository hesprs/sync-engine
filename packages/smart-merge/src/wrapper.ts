import type { Binary, FileStat, Fs, StoreAsync } from '@hesprs/sync-engine-sdk';
import { uint8ArrayToText } from '@repo/shared/binary';
import isMergeablePath from '@/utils/is-mergeable-path';

export default function smartMergeBaseTextWrapper(original: Fs, store: StoreAsync<string>): Fs {
	const write = original.write.bind(original);
	const move = original.move.bind(original);
	const remove = original.delete.bind(original);

	original.write = async (key: string, value: Binary, stat: FileStat) => {
		const uid = await write(key, value, stat);
		if (isMergeablePath(key)) await store.set(key, uint8ArrayToText(value));
		return uid;
	};

	original.move = async (oldKey: string, newKey: string) => {
		await move(oldKey, newKey);
		if (oldKey === newKey) return;
		const value = await store.get(oldKey);
		if (value !== undefined)
			await store.batch([
				{ key: newKey, type: 'set', value },
				{ key: oldKey, type: 'delete' },
			]);
	};

	original.delete = async (key: string) => {
		await remove(key);
		await store.delete(key);
	};

	return original;
}
