import { uint8ArrayEquals } from '@repo/shared/binary';
import { readWithSize, writeWithValue } from '@/utils/pipe';
import type { ConflictResolverPayload } from '../tasks/interface';

export default async function renameAndKeepBothResolver({
	local,
	record,
	remote,
	localFs,
	remoteFs,
	key,
}: ConflictResolverPayload) {
	const conflictKey = appendConflict(key);
	const [localValue, remoteValue] = await Promise.all([
		readWithSize(localFs, key, local),
		readWithSize(remoteFs, key, remote),
	]);
	if (!localValue || !remoteValue) return;

	if (
		localValue instanceof Uint8Array &&
		remoteValue instanceof Uint8Array &&
		uint8ArrayEquals(localValue, remoteValue)
	) {
		await record.set(key, { isDir: false, local: local.uid, remote: remote.uid });
		return;
	}

	if (local.mtime > remote.mtime) {
		await remoteFs.move(key, conflictKey);
		const [remoteCanonicalUid, localConflictUid] = await Promise.all([
			writeWithValue(remoteFs, key, localValue, local),
			writeWithValue(localFs, conflictKey, remoteValue, remote),
		]);
		await record.batch([
			{
				key,
				type: 'set',
				value: { isDir: false, local: local.uid, remote: remoteCanonicalUid },
			},
			{
				key: conflictKey,
				type: 'set',
				value: { isDir: false, local: localConflictUid, remote: remote.uid },
			},
		]);
	} else {
		await localFs.move(key, conflictKey);
		const [localCanonicalUid, remoteConflictUid] = await Promise.all([
			writeWithValue(localFs, key, remoteValue, remote),
			writeWithValue(remoteFs, conflictKey, localValue, local),
		]);
		await record.batch([
			{
				key,
				type: 'set',
				value: { isDir: false, local: localCanonicalUid, remote: remote.uid },
			},
			{
				key: conflictKey,
				type: 'set',
				value: { isDir: false, local: local.uid, remote: remoteConflictUid },
			},
		]);
	}
}

function appendConflict(f: string) {
	const i = f.lastIndexOf('.');
	return i === -1 ? `${f}.conflict` : `${f.slice(0, i)}.conflict${f.slice(i)}`;
}
