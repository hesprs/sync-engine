import {
	API_CONTENT,
	BATCH_LIMIT,
	batchEntryError,
	chunksOf,
	escapeHeaderJson,
	keyToPath,
	request2xx,
	rpc,
	tagsOf,
	toStat,
	uidOf,
	verifyEntries,
} from './api';
import UploadSessions from './sessions';
import { SESSION_CHUNK_SIZE, appendSession, concurrentUploadSession, read2xx } from './upload';
import { chunkSize, concurrency } from '@hesprs/sync-engine-sdk';
import { collectStreamToBinary } from '@repo/shared/binary';
import { toError } from '@repo/shared/error';
import { dirname } from '@repo/shared/path';
import createRangeReadStream from '@repo/shared/read-stream';
import parseTimestamp from '@repo/shared/timestamp';
import type { BatchEntry, ListFolderResult, Metadata, UploadArg } from './api';
import type {
	Binary,
	FileStat,
	FolderStat,
	ListReporter,
	MaybePromise,
	Request,
	RootFs,
	Stat,
	StringKV,
} from '@hesprs/sync-engine-sdk';

export type DropboxFsOptions = { accountId: string; useTrash: boolean };

export type BatchMoves = Array<{ newKey: string; oldKey: string }>;

type ListedEntry = Metadata & { path_lower: string };

type BatchLaunch = { '.tag'?: string; async_job_id?: string; entries?: Array<BatchEntry> };

const POLL_INTERVAL = 500;
const TEMP_PREFIX = '.sync-engine-rename-';
/** The folder batch endpoint accepts ten times more paths than the other batch endpoints. */
const FOLDER_BATCH_LIMIT = 10_000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function isCaseOnly(oldKey: string, newKey: string): boolean {
	return oldKey !== newKey && oldKey.toLowerCase() === newKey.toLowerCase();
}

function uploadArg(key: string, { mtime }: StringKV): UploadArg {
	const mtimeNum = parseTimestamp(mtime);
	return {
		autorename: false,
		client_modified: mtimeNum ? `${new Date(mtimeNum).toISOString().slice(0, 19)}Z` : undefined,
		mode: 'overwrite',
		mute: true,
		path: keyToPath(key),
	};
}

function mapBatchFailures<T>(
	entries: Array<BatchEntry>,
	items: Array<T>,
	keyOf: (item: T) => string,
	tolerate?: (error: Error & { tags: Array<string> }) => boolean,
): Record<string, Error> {
	const result: Record<string, Error> = {};
	entries.forEach((entry, index) => {
		if (entry['.tag'] !== 'failure') return;
		const error = batchEntryError(entry.failure);
		if (tolerate?.(error)) return;
		result[keyOf(items[index])] = error;
	});
	return result;
}

/**
 * Dropbox identifies entries by path inside a real folder hierarchy, so the fs is path-based and
 * needs no id cache. Keys are case-preserving; Dropbox itself matches paths case-insensitively, so
 * case-only renames go through a temporary path.
 */
export default class DropboxFs implements RootFs {
	private readonly uploadSessions: UploadSessions;

	constructor(
		private readonly request: Request,
		private readonly options: DropboxFsOptions,
	) {
		this.uploadSessions = new UploadSessions(request);
	}

	getUid(): string {
		return `dropbox~${this.options.accountId}`;
	}

	private async runBatch(
		start: string,
		check: string,
		launch: Record<string, unknown>,
		expected: number,
	): Promise<Array<BatchEntry>> {
		const started = (await rpc(this.request, start, launch)).json<BatchLaunch>();
		if (started['.tag'] === 'complete') return verifyEntries(started.entries, expected);
		while (true) {
			const status = (
				await rpc(this.request, check, { async_job_id: started.async_job_id })
			).json<BatchLaunch>();
			if (status['.tag'] === 'failed') throw new Error('Dropbox batch operation failed.');
			if (status['.tag'] === 'complete') return verifyEntries(status.entries, expected);
			await sleep(POLL_INTERVAL);
		}
	}

	/**
	 * Runs one `runBatch` per chunk concurrently; chunks are ordered, so flattened entries stay
	 * position-aligned.
	 */
	private async runBatchConcurrently<T>(
		start: string,
		check: string,
		chunks: Array<Array<T>>,
		launchOf: (chunk: Array<T>) => Record<string, unknown>,
	): Promise<Array<BatchEntry>> {
		return (
			await Promise.all(
				chunks.map((chunk) => this.runBatch(start, check, launchOf(chunk), chunk.length)),
			)
		).flat();
	}

	async read(key: string): Promise<Binary> {
		const response = await request2xx(this.request, `${API_CONTENT}/2/files/download`, {
			headers: { 'Dropbox-API-Arg': escapeHeaderJson({ path: keyToPath(key) }) },
			method: 'POST',
		});
		return response.bytes();
	}

	readStream(key: string, { size }: FileStat) {
		const url = `${API_CONTENT}/2/files/download`;
		const pathArg = escapeHeaderJson({ path: keyToPath(key) });
		return createRangeReadStream({
			chunkSize,
			concurrency,
			requestRange: async (start, endInclusive) => {
				const response = await request2xx(this.request, url, {
					headers: {
						'Dropbox-API-Arg': pathArg,
						Range: `bytes=${start}-${endInclusive}`,
					},
					method: 'POST',
				});
				return response.bytes();
			},
			size,
		});
	}

	async write(key: string, value: MaybePromise<Binary>, stat: FileStat): Promise<string> {
		const sessionId = this.uploadSessions.idOf(key);
		const commit = uploadArg(key, await stat.meta());
		const body = await value;
		if (sessionId === undefined) {
			const metadata = await read2xx(this.request, `${API_CONTENT}/2/files/upload`, {
				body,
				headers: {
					'Content-Type': 'application/octet-stream',
					'Dropbox-API-Arg': escapeHeaderJson(commit),
				},
			});
			return uidOf(metadata);
		}
		await read2xx(this.request, `${API_CONTENT}/2/files/upload_session/append_v2`, {
			body,
			headers: {
				'Content-Type': 'application/octet-stream',
				'Dropbox-API-Arg': escapeHeaderJson({
					close: true,
					cursor: { offset: 0, session_id: sessionId },
				}),
			},
		});
		return this.uploadSessions.markReady(key, sessionId, body.byteLength, commit);
	}

	async writeStream(
		key: string,
		value: MaybePromise<ReadableStream<Binary>>,
		stat: FileStat,
	): Promise<string> {
		const sessionId = this.uploadSessions.idOf(key);
		value = await value;
		if (sessionId !== undefined && stat.size >= SESSION_CHUNK_SIZE) {
			const total = await appendSession(this.request, sessionId, value);
			return this.uploadSessions.markReady(
				key,
				sessionId,
				total,
				uploadArg(key, await stat.meta()),
			);
		}
		if (stat.size < SESSION_CHUNK_SIZE)
			return this.write(key, await collectStreamToBinary(value), stat);
		const metadata = await concurrentUploadSession(
			{ arg: uploadArg(key, await stat.meta()), request: this.request },
			value,
		);
		return uidOf(metadata);
	}

	async delete(key: string): Promise<void> {
		try {
			await rpc(
				this.request,
				`/2/files/${this.options.useTrash ? 'delete_v2' : 'permanently_delete'}`,
				{ path: keyToPath(key) },
			);
		} catch (error) {
			if (!tagsOf(error).includes('not_found')) throw error;
		}
	}

	private async rename(from: string, to: string): Promise<void> {
		await rpc(this.request, '/2/files/move_v2', {
			autorename: false,
			from_path: keyToPath(from),
			to_path: keyToPath(to),
		});
	}

	async move(oldKey: string, newKey: string): Promise<void> {
		// Dropbox move endpoints do not support case-only renames, so hop through a temp path.
		if (isCaseOnly(oldKey, newKey)) {
			const parent = dirname(oldKey);
			const tempKey = `${parent === '/' ? '' : parent}${TEMP_PREFIX}${crypto.randomUUID()}`;
			await this.rename(oldKey, tempKey);
			await this.rename(tempKey, newKey);
			return;
		}
		await this.rename(oldKey, newKey);
	}

	/**
	 * Dropbox creates the missing ancestors of the path on its own, so `recursive` needs no special
	 * handling; only a file blocking the chain can fail the call, and re-creating an existing
	 * folder is not an error.
	 */
	async mkdir(key: string, _stat: FolderStat): Promise<void> {
		if (key === '/') return;
		try {
			await rpc(this.request, '/2/files/create_folder_v2', {
				autorename: false,
				path: keyToPath(key),
			});
		} catch (error) {
			const tags = tagsOf(error);
			if (!tags.includes('conflict') || !tags.includes('folder')) throw error;
		}
	}

	async stat(key: string): Promise<Stat> {
		if (key === '/') return { isDir: true, key, meta: () => ({}) };
		const response = await rpc(this.request, '/2/files/get_metadata', { path: keyToPath(key) });
		return toStat(key, response.json<Metadata>());
	}

	async exists(key: string): Promise<boolean> {
		try {
			await this.stat(key);
			return true;
		} catch (error) {
			if (!tagsOf(error).includes('not_found')) throw error;
			return false;
		}
	}

	/**
	 * Keys are built from the parent key plus entry name because `path_display` may carry stale
	 * case in non-final components.
	 */
	async list(key: string, reporter: ListReporter): Promise<Array<Stat>> {
		const startPath = keyToPath(key);
		const all: Array<Metadata> = [];
		const first = await rpc(this.request, '/2/files/list_folder', {
			path: startPath,
			recursive: true,
		});
		const page = first.json<ListFolderResult>();
		all.push(...page.entries);
		let cursor = page.has_more ? page.cursor : undefined;
		while (cursor !== undefined) {
			const response = await rpc(this.request, '/2/files/list_folder/continue', { cursor });
			const next = response.json<ListFolderResult>();
			all.push(...next.entries);
			cursor = next.has_more ? next.cursor : undefined;
		}

		const childrenByParent = new Map<string, Array<ListedEntry>>();
		for (const entry of all) {
			const { path_lower: pathLower } = entry;
			if (pathLower === undefined || pathLower === '') continue;
			const listed = entry as ListedEntry;
			const index = pathLower.lastIndexOf('/');
			const parent = index === 0 ? '' : pathLower.slice(0, index);
			const siblings = childrenByParent.get(parent);
			if (siblings) siblings.push(listed);
			else childrenByParent.set(parent, [listed]);
		}

		const results: Array<Stat> = [];
		const total = all.length;
		let completed = 0;
		const walk = async (folderLower: string, folderPrefix: string): Promise<void> => {
			for (const entry of childrenByParent.get(folderLower) ?? []) {
				const childKey = `${folderPrefix}${entry.name.normalize('NFC')}${entry['.tag'] === 'folder' ? '/' : ''}`;
				completed++;
				const verdict = await reporter({ completed, current: childKey, total });
				if (verdict === 'exclude') continue;
				results.push(toStat(childKey, entry));
				if (verdict === 'advance') await walk(entry.path_lower, childKey);
			}
		};
		await walk(startPath.toLowerCase(), key === '/' ? '' : key);
		return results;
	}

	/** Batch delete -- optimizer extension; `not_found` counts as success (idempotent). */
	async batchDelete(keys: Array<string>): Promise<Record<string, Error>> {
		const unique = [...new Set(keys)];
		const entries = await this.runBatchConcurrently(
			'/2/files/delete_batch',
			'/2/files/delete_batch/check',
			chunksOf(unique, BATCH_LIMIT),
			(chunk) => ({ entries: chunk.map((key) => ({ path: keyToPath(key) })) }),
		);
		return mapBatchFailures(
			entries,
			unique,
			(key) => key,
			(error) => tagsOf(error).includes('not_found'),
		);
	}

	/** Batch move -- optimizer extension; case-only renames are performed individually. */
	async batchMove(moves: BatchMoves): Promise<Record<string, Error>> {
		const result: Record<string, Error> = {};
		const batched: BatchMoves = [];
		for (const move of moves)
			if (isCaseOnly(move.oldKey, move.newKey))
				try {
					await this.move(move.oldKey, move.newKey);
				} catch (error) {
					result[move.oldKey] = toError(error);
				}
			else batched.push(move);
		const entries = await this.runBatchConcurrently(
			'/2/files/move_batch_v2',
			'/2/files/move_batch/check_v2',
			chunksOf(batched, BATCH_LIMIT),
			(chunk) => ({
				autorename: false,
				entries: chunk.map(({ newKey, oldKey }) => ({
					from_path: keyToPath(oldKey),
					to_path: keyToPath(newKey),
				})),
			}),
		);
		return Object.assign(
			result,
			mapBatchFailures(entries, batched, ({ oldKey }) => oldKey),
		);
	}

	/** Batch folder creation -- optimizer extension; an existing folder counts as success. */
	async batchMkdir(keys: Array<string>): Promise<Record<string, Error>> {
		const requested = [...new Set(keys)];
		const entries = await this.runBatchConcurrently(
			'/2/files/create_folder_batch',
			'/2/files/create_folder_batch/check',
			chunksOf(requested, FOLDER_BATCH_LIMIT),
			(chunk) => ({ autorename: false, paths: chunk.map(keyToPath) }),
		);
		return mapBatchFailures(
			entries,
			requested,
			(key) => key,
			(error) => tagsOf(error).includes('conflict') && tagsOf(error).includes('folder'),
		);
	}

	/** Batch session start -- optimizer extension; see `UploadSessions.start`. */
	startUploadSessions(keys: Array<string>) {
		return this.uploadSessions.start(keys);
	}

	setCommitReadyCallback(callback: (key: string) => void) {
		this.uploadSessions.setReadyCallback(callback);
	}

	clearCommitReadyCallback() {
		this.uploadSessions.clearReadyCallback();
	}

	/** Batch session commit -- optimizer extension; see `UploadSessions.finish`. */
	finishUploadSessions(keys?: Array<string>) {
		return this.uploadSessions.finish(keys);
	}
}
