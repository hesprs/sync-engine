import { diffCommon } from '@/diff3';
import merge from '@/utils/merge';
import { readWithSize, REGRET_ERROR_MESSAGE, writeWithSize } from '@hesprs/sync-engine-sdk';
import { textToUint8Array, uint8ArrayEquals, uint8ArrayToText } from '@repo/shared/binary';
import parseTimestamp from '@repo/shared/timestamp';
import type { MergeOptions } from '@/utils/merge';
import type {
	Binary,
	ConflictResolver,
	DatabaseAsync,
	FileStat,
	Fs,
	StringKV,
} from '@hesprs/sync-engine-sdk';

type SmartMergeStoreSchema = Record<`base-text-${string}`, string>;
type SmartMergeStoreMeta = Record<string, never>;

const REGRET_ERROR = new Error(REGRET_ERROR_MESSAGE);

export default function smartMergeResolver(
	mergeOptions: MergeOptions,
	db: DatabaseAsync<SmartMergeStoreSchema, SmartMergeStoreMeta>,
	getNamespace: (localFs?: Fs, remoteFs?: Fs) => string,
): ConflictResolver {
	return async ({ local, remote, key, localFs, remoteFs, record }) => {
		const store = db.getStore(`base-text-${getNamespace(localFs, remoteFs)}`);

		const latestSide = local.mtime > remote.mtime ? 'local' : 'remote';
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
				const result: StringKV = { mtime: String(Date.now()), ...localRest, ...remoteRest };
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
			size: latestSide === 'local' ? local.size : remote.size, // Match the latest survive fallback size to prevent writeWithSize misfiring
			uid: crypto.randomUUID(), // Doesn't matter
		};

		const getMergedBuffer = async (): Promise<
			| { type: 'latest'; side: 'local' | 'remote'; latest: Binary | ReadableStream<Binary> }
			| { type: 'merge'; localBuffer: Binary; remoteBuffer: Binary; mergedBuffer: Binary }
		> => {
			const [localBuffer, remoteBuffer, baseText] = await Promise.all([
				readWithSize(localFs, key, local),
				readWithSize(remoteFs, key, remote),
				store.get(key),
			]);
			if (localBuffer instanceof ReadableStream || remoteBuffer instanceof ReadableStream)
				return {
					latest: latestSide === 'local' ? localBuffer : remoteBuffer,
					side: latestSide,
					type: 'latest',
				};
			if (uint8ArrayEquals(localBuffer, remoteBuffer)) {
				await record.set(key, { isDir: false, local: local.uid, remote: remote.uid });
				throw REGRET_ERROR;
			}

			const localText = uint8ArrayToText(localBuffer);
			const remoteText = uint8ArrayToText(remoteBuffer);
			const mergedText = merge(
				{ a: localText, b: remoteText, o: baseText ?? commonBase(localText, remoteText) },
				mergeOptions,
			);
			const mergedBuffer = textToUint8Array(mergedText);
			return { localBuffer, mergedBuffer, remoteBuffer, type: 'merge' };
		};
		const mergePromise = getMergedBuffer();
		const content = async (side: 'local' | 'remote') => {
			const result = await mergePromise;
			if (result.type === 'latest') {
				const { side: contentSide, latest } = result;
				if (contentSide === side) throw REGRET_ERROR;
				return latest;
			}
			const { localBuffer, remoteBuffer, mergedBuffer } = result;
			if (
				(side === 'local' && uint8ArrayEquals(localBuffer, mergedBuffer)) ||
				(side === 'remote' && uint8ArrayEquals(remoteBuffer, mergedBuffer))
			)
				throw REGRET_ERROR;
			return mergedBuffer;
		};
		const write = (side: 'local' | 'remote') =>
			Promise.resolve(
				writeWithSize(
					side === 'local' ? localFs : remoteFs,
					key,
					content(side),
					mergedStat,
				),
			).catch((error: unknown) => {
				if (error === REGRET_ERROR) return side === 'local' ? local.uid : remote.uid;
				throw error;
			});

		const [localUid, remoteUid] = await Promise.all([write('local'), write('remote')]);
		await record.set(key, { isDir: false, local: localUid, remote: remoteUid });
	};
}

function commonBase(a: string, b: string): string {
	return diffCommon(a.split('\n'), b.split('\n'))
		.flatMap((segment) => (segment.type === 'common' ? segment.common : []))
		.join('\n');
}
