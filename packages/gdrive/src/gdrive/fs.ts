import type {
	Binary,
	DatabaseSync,
	FileStat,
	ListReporter,
	Request,
	RequestParam,
	RequestResponse,
	RootFs,
	Stat,
	StoreSync,
} from '@hesprs/sync-engine-sdk';
import { textToUint8Array } from '@repo/shared/binary';
import { getStatus } from '@repo/shared/get-status';
import { basename, dirname, isFolder } from '@repo/shared/path';
import type { DriveFile, DriveFileList } from './api';
import {
	DRIVE_API,
	DRIVE_UPLOAD_API,
	FILE_FIELDS,
	FOLDER_MIME,
	buildUrl,
	escapeQuery,
	parseDriveError,
	toFileStat,
} from './api';
import createRangeReadStream from './read-stream';
import { guessMimeType, resumableUpload, singlePutUpload } from './upload';

export type GdriveFsOptions = {
	userId: string;
	useTrash: boolean;
};

export type GdriveDB = DatabaseSync<{ gdriveIds: string }, { gdriveIdsMarker?: string }>;

const READ_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MiB
const READ_MAX_CONCURRENT = 8;
const PAGE_SIZE = 1000;
const WRITE_FIELDS = 'id,md5Checksum';
const ROOT_ID = 'root';

function notFoundError(key: string): Error {
	const error = new Error(`Google Drive: ${key} does not exist.`);
	(error as { status?: number }).status = 404;
	return error;
}

/**
 * Google Drive stores files by immutable id inside real folders, while
 * Sync Engine speaks path keys. Fs translates keys to ids
 * and caches the mapping.
 *
 * Limitation: cannot download a file with known key but not cached ID, this is
 * fine in current implementation (impossible to happen).
 */
export default class GdriveFs implements RootFs {
	/** Path key (`'/'`, `folder/`, `folder/note.md`) to Drive file id. */
	private readonly ids: StoreSync<string>;

	constructor(
		private readonly request: Request,
		private readonly options: GdriveFsOptions,
		memoryDB: GdriveDB,
	) {
		this.ids = memoryDB.getStore('gdriveIds');
		if (memoryDB.getMeta('gdriveIdsMarker') !== this.getUid()) {
			this.ids.clear();
			memoryDB.setMeta('gdriveIdsMarker', this.getUid());
		}
	}

	getUid(): string {
		return `gdrive~${this.options.userId}`;
	}

	private async requestOrThrow(params: RequestParam): Promise<RequestResponse> {
		const response = await this.request(Object.assign(params, { throw: false }));
		if (response.status >= 200 && response.status < 300) return response;
		const error = new Error(
			parseDriveError(response) ??
				`Google Drive request failed: ${response.status} ${params.method} ${params.url}`,
		);
		(error as { status?: number }).status = response.status;
		throw error;
	}

	private resolveId(key: string): string | undefined {
		if (key === '/') return ROOT_ID;
		return this.ids.get(key);
	}

	private dropCache(key: string): void {
		this.ids.delete(key);
		if (!isFolder(key)) return;
		for (const cachedKey of this.ids.keys())
			if (cachedKey.startsWith(key)) this.ids.delete(cachedKey);
	}

	/**
	 * Walks the path chain of `key` from root with fresh queries, ignoring and
	 * refreshing the cache along the way.
	 */
	private async resolveIdFresh(key: string): Promise<string | undefined> {
		if (key === '/') return ROOT_ID;
		const segments = key.split('/').filter((segment) => segment !== '');
		let parentId = ROOT_ID;
		let prefix = '';
		for (const [index, segment] of segments.entries()) {
			const last = index === segments.length - 1;
			const childKey = `${prefix}${segment}${last && !isFolder(key) ? '' : '/'}`;
			const folder = !last || isFolder(key);
			const response = await this.requestOrThrow({
				method: 'GET',
				url: buildUrl(DRIVE_API, '/files', {
					fields: 'files(id)',
					pageSize: '1',
					q: `'${parentId}' in parents and name = '${escapeQuery(segment)}' and mimeType ${folder ? '=' : '!='} '${FOLDER_MIME}' and trashed = false`,
				}),
			});
			const id = (response.json() as DriveFileList).files?.[0]?.id;
			if (!id) return undefined;
			this.ids.set(childKey, id);
			parentId = id;
			prefix = childKey;
		}
		return parentId;
	}

	/** Session metadata for uploading `key`, updating the existing file when present. */
	private sessionFor(
		key: string,
		stat: FileStat,
	): { initiateUrl: string; method: 'PATCH' | 'POST'; metadata: object } {
		const modifiedTime = new Date(stat.mtime).toISOString();
		const existing = this.resolveId(key);
		if (existing)
			return {
				initiateUrl: buildUrl(DRIVE_UPLOAD_API, `/files/${existing}`, {
					fields: WRITE_FIELDS,
					uploadType: 'resumable',
				}),
				metadata: { modifiedTime },
				method: 'PATCH',
			};
		const parentId = this.resolveId(dirname(key));
		return {
			initiateUrl: buildUrl(DRIVE_UPLOAD_API, '/files', {
				fields: WRITE_FIELDS,
				uploadType: 'resumable',
			}),
			metadata: {
				mimeType: guessMimeType(basename(key)),
				modifiedTime,
				name: basename(key),
				parents: [parentId],
			},
			method: 'POST',
		};
	}

	async read(key: string): Promise<Binary> {
		const id = this.resolveId(key);
		if (id === undefined) throw notFoundError(key);
		const response = await this.requestOrThrow({
			method: 'GET',
			url: buildUrl(DRIVE_API, `/files/${id}`, { alt: 'media' }),
		});
		return response.bytes();
	}

	readStream(key: string, { size }: FileStat): ReadableStream<Binary> {
		const id = this.resolveId(key);
		if (id === undefined) throw notFoundError(key);
		const url = buildUrl(DRIVE_API, `/files/${id}`, { alt: 'media' });
		return createRangeReadStream({
			chunkSize: READ_CHUNK_SIZE,
			maxConcurrent: READ_MAX_CONCURRENT,
			requestRange: async (start, endInclusive) => {
				const response = await this.requestOrThrow({
					headers: { Range: `bytes=${start}-${endInclusive}` },
					method: 'GET',
					url,
				});
				return response.bytes();
			},
			size,
		});
	}

	async write(key: string, value: Binary, stat: FileStat): Promise<string> {
		const file = await singlePutUpload(
			{
				...this.sessionFor(key, stat),
				request: this.request,
				size: value.byteLength,
			},
			value,
		);
		if (file.id) this.ids.set(key, file.id);
		return file.md5Checksum ?? `${stat.mtime}~${stat.size}`;
	}

	async writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat): Promise<string> {
		const file = await resumableUpload(
			{ ...this.sessionFor(key, stat), request: this.request, size: stat.size },
			value,
		);
		if (file.id) this.ids.set(key, file.id);
		return file.md5Checksum ?? `${stat.mtime}~${stat.size}`;
	}

	async delete(key: string): Promise<void> {
		const id = this.resolveId(key);
		if (id === undefined) return;
		try {
			await this.requestOrThrow(
				this.options.useTrash
					? {
							body: textToUint8Array(JSON.stringify({ trashed: true })),
							headers: { 'Content-Type': 'application/json; charset=UTF-8' },
							method: 'PATCH',
							url: buildUrl(DRIVE_API, `/files/${id}`, { fields: 'id' }),
						}
					: {
							method: 'DELETE',
							url: buildUrl(DRIVE_API, `/files/${id}`),
						},
			);
		} catch (error) {
			if (getStatus(error) !== 404) throw error;
		}
		this.dropCache(key);
	}

	async move(oldKey: string, newKey: string): Promise<void> {
		const id = this.resolveId(oldKey);
		if (id === undefined) throw notFoundError(oldKey);
		const oldParentId = this.resolveId(dirname(oldKey));
		const newParentId = this.resolveId(dirname(newKey));
		if (!newParentId) throw new Error(`Parent not created when moving to "${newKey}"!`);
		const query: Record<string, string> = { fields: 'id' };
		if (oldParentId !== newParentId) {
			query.addParents = newParentId;
			if (oldParentId !== undefined) query.removeParents = oldParentId;
		}
		await this.requestOrThrow({
			body: textToUint8Array(JSON.stringify({ name: basename(newKey) })),
			headers: { 'Content-Type': 'application/json; charset=UTF-8' },
			method: 'PATCH',
			url: buildUrl(DRIVE_API, `/files/${id}`, query),
		});
		this.dropCache(oldKey);
	}

	/** Drive folders always need an existing parent id, so missing parents are created regardless of `recursive`. */
	async mkdir(key: string, recursive: boolean): Promise<void> {
		const parent = dirname(key);
		let parentId = this.resolveId(parent);
		if (!parent && recursive) {
			await this.mkdir(parent, true);
			parentId = this.resolveId(parent);
		}
		if (!parentId) throw new Error(`Parent is not created when creating "${key}"!`);
		const response = await this.requestOrThrow({
			body: textToUint8Array(
				JSON.stringify({ mimeType: FOLDER_MIME, name: basename(key), parents: [parentId] }),
			),
			headers: { 'Content-Type': 'application/json; charset=UTF-8' },
			method: 'POST',
			url: buildUrl(DRIVE_API, '/files', { fields: 'id' }),
		});
		const created = response.json() as DriveFile;
		if (!created.id) throw new Error('Google Drive did not return an id for a created folder!');
		this.ids.set(key, created.id);
	}

	async stat(key: string): Promise<Stat> {
		const parentId = this.resolveId(dirname(key));
		if (!parentId) throw notFoundError(key);
		const url = buildUrl(DRIVE_API, '/files', {
			fields: `files(${FILE_FIELDS})`,
			orderBy: 'modifiedTime desc',
			pageSize: '1',
			q: `'${parentId}' in parents and name = '${escapeQuery(basename(key))}' and trashed = false`,
		});
		const response = await this.requestOrThrow({ method: 'GET', url });
		const entry = (response.json() as DriveFileList).files?.[0];
		if (!entry) throw notFoundError(key);
		return toFileStat(key, entry);
	}

	// When Sync Engine calls `exists()`, the only possibility is that something is unexpected, don't trust cache here
	async exists(key: string): Promise<boolean> {
		return (await this.resolveIdFresh(key)) !== undefined;
	}

	/**
	 * Fetches every visible file in one paginated query, then walks the tree
	 * under the requested key so the reporter can steer traversal.
	 */
	async list(key: string, reporter: ListReporter): Promise<Array<Stat>> {
		const startId = this.resolveId(key) ?? (await this.resolveIdFresh(key));
		if (startId === undefined) throw notFoundError(key);
		const all: Array<DriveFile> = [];
		let pageToken: string | undefined;
		do {
			const query: Record<string, string> = {
				fields: `nextPageToken,files(${FILE_FIELDS})`,
				pageSize: String(PAGE_SIZE),
				q: 'trashed = false',
			};
			if (pageToken) query.pageToken = pageToken;
			const response = await this.requestOrThrow({
				method: 'GET',
				url: buildUrl(DRIVE_API, '/files', query),
			});
			const parsed = response.json() as DriveFileList;
			all.push(...(parsed.files ?? []));
			pageToken = parsed.nextPageToken;
		} while (pageToken);

		this.ids.clear();
		this.ids.set(key, startId);
		const childrenByParent = new Map<string, Array<DriveFile>>();
		for (const file of all) {
			const parent = file.parents?.[0];
			if (!parent) continue;
			const siblings = childrenByParent.get(parent);
			if (siblings) siblings.push(file);
			else childrenByParent.set(parent, [file]);
		}

		const results: Array<Stat> = [];
		const total = all.length;
		let completed = 0;
		const walk = async (folderId: string, prefix: string): Promise<void> => {
			for (const entry of dedupeChildren(childrenByParent.get(folderId) ?? [])) {
				const folder = entry.mimeType === FOLDER_MIME;
				const childKey = `${prefix}${entry.name}${folder ? '/' : ''}`;
				completed++;
				const verdict = await reporter({ completed, current: childKey, total });
				if (verdict === 'exclude') continue;
				this.ids.set(childKey, entry.id);
				if (folder) {
					results.push({ isDir: true, key: childKey });
					if (verdict === 'advance') await walk(entry.id, childKey);
				} else results.push(toFileStat(childKey, entry));
			}
		};
		await walk(startId, key === '/' ? '' : key);
		return results;
	}
}

/**
 * Drive allows duplicate names inside one folder; syncing needs one entry per
 * key, so the most recently modified file (or the first folder) wins.
 */
function dedupeChildren(entries: Array<DriveFile>): Array<DriveFile> {
	if (entries.length < 2) return entries;
	const byName = new Map<string, DriveFile>();
	for (const entry of entries) {
		const nameKey = `${entry.mimeType === FOLDER_MIME ? 'd' : 'f'}~${entry.name}`;
		const existing = byName.get(nameKey);
		if (!existing) {
			byName.set(nameKey, entry);
			continue;
		}
		if (
			entry.mimeType !== FOLDER_MIME &&
			Date.parse(entry.modifiedTime ?? '') > Date.parse(existing.modifiedTime ?? '')
		)
			byName.set(nameKey, entry);
	}
	return [...byName.values()];
}
