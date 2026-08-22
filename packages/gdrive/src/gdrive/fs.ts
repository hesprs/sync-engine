import type {
	Binary,
	FileStat,
	ListReporter,
	Request,
	RequestParam,
	RequestResponse,
	RootFs,
	Stat,
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

const READ_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MiB
const READ_MAX_CONCURRENT = 8;
const PAGE_SIZE = 1000;
const WRITE_FIELDS = 'id,md5Checksum';

function notFoundError(key: string): Error {
	const error = new Error(`Google Drive: ${key} does not exist.`);
	(error as { status?: number }).status = 404;
	return error;
}

/**
 * Google Drive stores files by immutable id inside real folders, while the
 * sync engine speaks path keys. This class translates keys to ids on demand
 * and caches the mapping for the lifetime of the instance. Only files created
 * through this module are visible because of the `drive.file` OAuth scope.
 */
export default class GdriveFs implements RootFs {
	/** Path key (`'/'`, `folder/`, `folder/note.md`) to Drive file id. */
	private readonly ids = new Map<string, string>();

	constructor(
		private readonly request: Request,
		private readonly options: GdriveFsOptions,
	) {}

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

	private async lookupChild(
		parentId: string,
		name: string,
		folder: boolean,
	): Promise<DriveFile | undefined> {
		const mimeClause = folder
			? ` and mimeType = '${FOLDER_MIME}'`
			: ` and mimeType != '${FOLDER_MIME}'`;
		const url = buildUrl(DRIVE_API, '/files', {
			fields: `files(${FILE_FIELDS})`,
			orderBy: 'modifiedTime desc',
			pageSize: '1',
			q: `'${escapeQuery(parentId)}' in parents and name = '${escapeQuery(name)}' and trashed = false${mimeClause}`,
		});
		const response = await this.requestOrThrow({ method: 'GET', url });
		return (response.json() as DriveFileList).files?.[0];
	}

	private async createFolder(parentId: string, name: string): Promise<string> {
		const response = await this.requestOrThrow({
			body: textToUint8Array(
				JSON.stringify({ mimeType: FOLDER_MIME, name, parents: [parentId] }),
			),
			headers: { 'Content-Type': 'application/json; charset=UTF-8' },
			method: 'POST',
			url: buildUrl(DRIVE_API, '/files', { fields: 'id' }),
		});
		const created = response.json() as DriveFile;
		if (!created.id) throw new Error('Google Drive did not return an id for a created folder!');
		return created.id;
	}

	/**
	 * Resolves the real root id (never the `root` alias) so listing can match
	 * ids returned in `parents`.
	 */
	private async rootId(): Promise<string> {
		const cached = this.ids.get('/');
		if (cached !== undefined) return cached;
		const response = await this.requestOrThrow({
			method: 'GET',
			url: buildUrl(DRIVE_API, '/files/root', { fields: 'id' }),
		});
		const id = (response.json() as DriveFile).id;
		if (!id) throw new Error('Google Drive did not return the root folder id!');
		this.ids.set('/', id);
		return id;
	}

	/** Resolves a key to its id, or `undefined` when it does not exist. */
	private async resolveId(key: string): Promise<string | undefined> {
		if (key === '/') return this.rootId();
		const cached = this.ids.get(key);
		if (cached !== undefined) return cached;
		const parentId = await this.resolveId(dirname(key));
		if (parentId === undefined) return undefined;
		const existing = await this.lookupChild(parentId, basename(key), isFolder(key));
		if (existing) this.ids.set(key, existing.id);
		return existing?.id;
	}

	/** Resolves a folder key to its id, creating the folder chain when missing. */
	private async ensureFolderId(key: string): Promise<string> {
		if (key === '/') return this.rootId();
		const cached = this.ids.get(key);
		if (cached !== undefined) return cached;
		const parentId = await this.ensureFolderId(dirname(key));
		const existing = await this.lookupChild(parentId, basename(key), true);
		if (existing) {
			this.ids.set(key, existing.id);
			return existing.id;
		}
		const created = await this.createFolder(parentId, basename(key));
		this.ids.set(key, created);
		return created;
	}

	/** Fresh metadata lookup for a file key (also refreshes the id cache). */
	private async resolveEntry(key: string): Promise<DriveFile | undefined> {
		const parentId = await this.resolveId(dirname(key));
		if (parentId === undefined) return undefined;
		const entry = await this.lookupChild(parentId, basename(key), false);
		if (entry) this.ids.set(key, entry.id);
		return entry;
	}

	private dropCache(key: string): void {
		this.ids.delete(key);
		if (!isFolder(key)) return;
		for (const cachedKey of this.ids.keys())
			if (cachedKey.startsWith(key)) this.ids.delete(cachedKey);
	}

	/** Session metadata for uploading `key`, updating the existing file when present. */
	private async sessionFor(
		key: string,
		stat: FileStat,
	): Promise<{ initiateUrl: string; method: 'PATCH' | 'POST'; metadata: object }> {
		const modifiedTime = new Date(stat.mtime).toISOString();
		const existing = await this.resolveEntry(key);
		if (existing)
			return {
				initiateUrl: buildUrl(DRIVE_UPLOAD_API, `/files/${existing.id}`, {
					fields: WRITE_FIELDS,
					uploadType: 'resumable',
				}),
				metadata: { modifiedTime },
				method: 'PATCH',
			};
		const parentId = await this.ensureFolderId(dirname(key));
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
		const id = await this.resolveId(key);
		if (id === undefined) throw notFoundError(key);
		const response = await this.requestOrThrow({
			method: 'GET',
			url: buildUrl(DRIVE_API, `/files/${id}`, { alt: 'media' }),
		});
		return response.bytes();
	}

	async readStream(key: string, { size }: FileStat): Promise<ReadableStream<Binary>> {
		const id = await this.resolveId(key);
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
				...(await this.sessionFor(key, stat)),
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
			{ ...(await this.sessionFor(key, stat)), request: this.request, size: stat.size },
			value,
		);
		if (file.id) this.ids.set(key, file.id);
		return file.md5Checksum ?? `${stat.mtime}~${stat.size}`;
	}

	async delete(key: string): Promise<void> {
		const id = await this.resolveId(key);
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
		const id = await this.resolveId(oldKey);
		if (id === undefined) throw notFoundError(oldKey);
		const oldParentId = await this.resolveId(dirname(oldKey));
		const newParentId = await this.ensureFolderId(dirname(newKey));
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
	async mkdir(key: string): Promise<void> {
		await this.ensureFolderId(key);
	}

	async stat(key: string): Promise<Stat> {
		if (isFolder(key)) {
			if ((await this.resolveId(key)) === undefined) throw notFoundError(key);
			return { isDir: true, key };
		}
		const entry = await this.resolveEntry(key);
		if (!entry) throw notFoundError(key);
		return toFileStat(key, entry);
	}

	async exists(key: string): Promise<boolean> {
		return key === '/' || (await this.resolveId(key)) !== undefined;
	}

	/**
	 * Fetches every visible file in one paginated query (the `drive.file`
	 * scope limits results to files this module created), then walks the tree
	 * under the requested key so the reporter can steer traversal.
	 */
	async list(key: string, reporter: ListReporter): Promise<Array<Stat>> {
		const startId = await this.resolveId(key);
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

		const childrenByParent = new Map<string, Array<DriveFile>>();
		for (const file of all) {
			const parent = file.parents?.[0];
			if (!parent || file.name.includes('/')) continue;
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
