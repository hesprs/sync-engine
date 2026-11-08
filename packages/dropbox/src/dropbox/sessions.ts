import { BATCH_LIMIT, batchEntryError, chunksOf, rpc, uidOf, verifyEntries } from './api';
import { toError } from '@repo/shared/error';
import type { FinishBatchEntry, UploadArg } from './api';
import type { Request } from '@hesprs/sync-engine-sdk';

/** A fully uploaded session waiting for its batched commit. */
type SessionCommit = {
	commit: UploadArg;
	offset: number;
	reject: (error: Error) => void;
	resolve: (uid: string) => void;
	sessionId: string;
};

/**
 * The batched upload sessions of one fs: the started session id of each key, and the fully uploaded
 * sessions waiting for their batched commit.
 */
export default class UploadSessions {
	private readonly sessionIds = new Map<string, string>();
	private readonly commits = new Map<string, SessionCommit>();
	private readyCallback: ((key: string) => void) | undefined;

	constructor(private readonly request: Request) {}

	idOf(key: string): string | undefined {
		return this.sessionIds.get(key);
	}

	setReadyCallback(callback: (key: string) => void) {
		this.readyCallback = callback;
	}

	clearReadyCallback() {
		this.readyCallback = undefined;
	}

	/**
	 * Starts one session per key on `upload_session/start_batch`; a duplicate call overrides the
	 * previous mapping for its keys.
	 */
	async start(keys: Array<string>): Promise<void> {
		for (const chunk of chunksOf(keys, BATCH_LIMIT)) {
			const started = await rpc(this.request, '/2/files/upload_session/start_batch', {
				num_sessions: chunk.length,
				session_type: { '.tag': 'concurrent' },
			});
			const { session_ids: sessionIds } = started.json<{ session_ids: Array<string> }>();
			chunk.forEach((key, index) => this.sessionIds.set(key, sessionIds[index]));
		}
	}

	/** Parks a fully uploaded session for a batched commit; the promise settles with the uid. */
	markReady(key: string, sessionId: string, size: number, commit: UploadArg): Promise<string> {
		const ready = new Promise<string>((resolve, reject) => {
			this.commits.set(key, { commit, offset: size, reject, resolve, sessionId });
		});
		this.sessionIds.delete(key);
		this.readyCallback?.(key);
		return ready;
	}

	/**
	 * Commits the parked sessions of the given keys, or every parked one when called without keys;
	 * only successful entries leave the map, so failed ones are retried by a later call. Settles
	 * every entry it takes, whatever happens.
	 */
	async finish(keys?: Array<string>): Promise<void> {
		const taken: Array<{ entry: SessionCommit; key: string }> = [];
		for (const key of keys ?? this.commits.keys()) {
			const entry = this.commits.get(key);
			if (entry !== undefined) taken.push({ entry, key });
		}
		for (const chunk of chunksOf(taken, BATCH_LIMIT))
			try {
				const finished = await rpc(
					this.request,
					'/2/files/upload_session/finish_batch_v2',
					{
						entries: chunk.map(({ entry }) => ({
							commit: entry.commit,
							cursor: { offset: entry.offset, session_id: entry.sessionId },
						})),
					},
				);
				const entries = verifyEntries(
					finished.json<{ entries?: Array<FinishBatchEntry> }>().entries,
					chunk.length,
				);
				entries.forEach((entry, index) => {
					const { entry: takenEntry, key } = chunk[index];
					if (entry['.tag'] === 'success') {
						this.commits.delete(key);
						takenEntry.resolve(uidOf(entry));
					} else takenEntry.reject(batchEntryError(entry.failure));
				});
			} catch (error) {
				const reason = toError(error);
				for (const { entry } of chunk) entry.reject(reason);
			}
	}
}
