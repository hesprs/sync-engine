import { readWithSize, REGRET_ERROR, writeWithSize } from '@/utils/pipe';
import { uint8ArrayEquals } from '@repo/shared/binary';
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
	const localCanonical = local.mtime > remote.mtime;

	const resolveValues = async () => {
		const [localValue, remoteValue] = await Promise.all([
			readWithSize(localFs, key, local),
			readWithSize(remoteFs, key, remote),
		]);
		if (
			localValue instanceof Uint8Array &&
			remoteValue instanceof Uint8Array &&
			uint8ArrayEquals(localValue, remoteValue)
		) {
			await record.set(key, { isDir: false, local: local.uid, remote: remote.uid });
			throw REGRET_ERROR;
		}
		await (localCanonical ? remoteFs : localFs).move(key, conflictKey);
		return { localValue, remoteValue };
	};
	const valuesPromise = resolveValues();

	const [canonicalUid, conflictUid] = await Promise.all([
		writeWithSize(
			localCanonical ? remoteFs : localFs,
			key,
			valuesPromise.then(({ localValue, remoteValue }) =>
				localCanonical ? localValue : remoteValue,
			),
			local,
		),
		writeWithSize(
			localCanonical ? localFs : remoteFs,
			conflictKey,
			valuesPromise.then(({ localValue, remoteValue }) =>
				localCanonical ? remoteValue : localValue,
			),
			remote,
		),
	]);
	await record.batch([
		{
			key,
			type: 'set',
			value: {
				isDir: false,
				local: localCanonical ? local.uid : canonicalUid,
				remote: localCanonical ? canonicalUid : remote.uid,
			},
		},
		{
			key: conflictKey,
			type: 'set',
			value: {
				isDir: false,
				local: localCanonical ? conflictUid : local.uid,
				remote: localCanonical ? remote.uid : conflictUid,
			},
		},
	]);
}

function appendConflict(f: string) {
	const i = f.lastIndexOf('.');
	return i === -1 ? `${f}.conflict` : `${f.slice(0, i)}.conflict${f.slice(i)}`;
}
