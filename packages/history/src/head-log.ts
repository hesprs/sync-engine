import { sha256Text } from '@repo/shared/sha256-bytes';
import type { CommitLog } from '@/types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type LogWithoutIntegrity = Omit<CommitLog, 'integrity'>;

function canonical(log: LogWithoutIntegrity): string {
	return JSON.stringify({
		chunkIndex: log.chunkIndex,
		deviceId: log.deviceId,
		generation: log.generation,
		heads: log.heads,
		ns: log.ns,
		packs: log.packs,
		peakLamport: log.peakLamport,
		seq: log.seq,
		updatedAt: log.updatedAt,
	});
}

/** Builds a head log with a fresh integrity hash. */
export async function buildCommitLog(log: LogWithoutIntegrity): Promise<CommitLog> {
	return { ...log, integrity: await sha256Text(canonical(log)) };
}

export function encodeHeadLog(log: CommitLog): Uint8Array {
	return encoder.encode(JSON.stringify(log));
}

/** Decodes and verifies a head log. Returns undefined when the integrity hash does not match. */
export async function decodeHeadLog(bytes: Uint8Array): Promise<CommitLog | undefined> {
	let log: CommitLog;
	try {
		log = JSON.parse(decoder.decode(bytes)) as CommitLog;
	} catch {
		return undefined;
	}
	const { integrity, ...rest } = log;
	const expected = await sha256Text(canonical(rest));
	return expected === integrity ? log : undefined;
}
