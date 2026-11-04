import merge from '@/utils/merge';
import { pipe } from '@hesprs/sync-engine-sdk';
import { textToUint8Array, uint8ArrayToText } from '@repo/shared/binary';
import parseTimestamp from '@repo/shared/timestamp';
import type { MergeOptions } from '@/utils/merge';
import type {
	ConflictResolver,
	DatabaseAsync,
	FileStat,
	Fs,
	StringKV,
} from '@hesprs/sync-engine-sdk';

type SmartMergeStoreSchema = Record<`base-text-${string}`, string>;
type SmartMergeStoreMeta = Record<string, never>;

export default function smartMergeResolver(
	mergeOptions: MergeOptions,
	db: DatabaseAsync<SmartMergeStoreSchema, SmartMergeStoreMeta>,
	getNamespace: (localFs?: Fs, remoteFs?: Fs) => string,
): ConflictResolver {
	return async ({ local, remote, key, localFs, remoteFs, record }) => {
		const store = db.getStore(`base-text-${getNamespace(localFs, remoteFs)}`);
		const [localBuffer, remoteBuffer, baseText] = await Promise.all([
			localFs.read(key, local),
			remoteFs.read(key, remote),
			store.get(key),
		]);

		if (baseText !== undefined) {
			const localText = uint8ArrayToText(localBuffer);
			const remoteText = uint8ArrayToText(remoteBuffer);
			if (localText === remoteText) {
				await record.set(key, { isDir: false, local: local.uid, remote: remote.uid });
				return;
			}
			const mergedText = merge({ a: localText, b: remoteText, o: baseText }, mergeOptions);
			const mergedBuffer = textToUint8Array(mergedText);
			const mergeTime = Date.now();
			const mergedStat: FileStat = {
				isDir: false,
				key,
				meta: async () => {
					const [
						{ mtime: _r, ctime: rc, ...remoteRest },
						{ mtime: _l, ctime: lc, ...localRest },
					] = await Promise.all([remote.meta(), local.meta()]);
					const remoteCtime = parseTimestamp(rc);
					const localCtime = parseTimestamp(lc);
					const result: StringKV = {
						mtime: String(mergeTime),
						...localRest,
						...remoteRest,
					};
					const mergeCtime = () => {
						if (!remoteCtime && !localCtime) return;
						if (remoteCtime && localCtime) return Math.min(remoteCtime, localCtime);
						return remoteCtime || localCtime;
					};
					const ctime = mergeCtime();
					if (ctime) result.ctime = String(ctime);
					return result;
				},
				mtime: Math.max(local.mtime, remote.mtime),
				size: mergedBuffer.byteLength,
				uid: crypto.randomUUID(),
			};
			const [localUid, remoteUid] = await Promise.all([
				mergedText === localText
					? Promise.resolve(local.uid)
					: localFs.write(key, mergedBuffer, mergedStat),
				mergedText === remoteText
					? Promise.resolve(remote.uid)
					: remoteFs.write(key, mergedBuffer, mergedStat),
			]);
			await record.set(key, { isDir: false, local: localUid, remote: remoteUid });
			return;
		}

		if (local.mtime > remote.mtime) {
			const uid = await pipe({ from: localFs, key, stat: local, to: remoteFs });
			if (!uid) return;
			await record.set(key, { isDir: false, local: local.uid, remote: uid });
		} else {
			const uid = await pipe({ from: remoteFs, key, stat: remote, to: localFs });
			if (!uid) return;
			await record.set(key, { isDir: false, local: uid, remote: remote.uid });
		}
	};
}
