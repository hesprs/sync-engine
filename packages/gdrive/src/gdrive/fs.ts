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
import { basename, dirname, isFolder, normalizeBaseDir } from '@repo/shared/path';
import type { DriveFile, DriveFileList } from './api';
import {
	DRIVE_API,
	DRIVE_UPLOAD_API,
	FILE_FIELDS,
	FOLDER_MIME,
	buildUrl,
	escapeQuery,
	parseDriveError,
	safeJson,
	toFileStat,
} from './api';
import createRangeReadStream from './read-stream';
import { RESUMABLE_CHUNK_SIZE, buildMultipartBody, guessMimeType, resumableUpload } from './upload';

export type GdriveFsOptions = {
	account: string;
	baseDirectory: string;
	useTrash: boolean;
	request: Request;
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
	private readonly request: Request;
	private readonly baseDirectory: string;
	private readonly useTrash: boolean;
	/** Path key (`'/'`, `folder/`, `folder/note.md`) to Drive file id. */
	private readonly ids = new Map<string, string>();

	constructor(private readonly options: GdriveFsOptions) {
		if (!options.request) throw new Error('Google Drive request is required.');
		this.request = options.request;
		this.baseDirectory = normalizeBaseDir(options.baseDirectory);
		this.useTrash = options.useTrash;
	}

	getUid(): string {
		return `gdrive~${this.options.account}~${this.baseDirectory}`;
	}

	private async requestOrThrow(params: RequestParam): Promise<RequestResponse> {
		const response = await this.request(params);
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
			pageSize: '2',
			q: `'${escapeQuery(parentId)}' in parents and name = '${escapeQuery(name)}' and trashed = false${mimeClause}`,
		});
		const response = await this.requestOrThrow({ method: 'GET', url });
		return (safeJson(response) as DriveFileList).files?.[0];
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
		const created = safeJson(response) as DriveFile;
		if (!created.id) throw new Error('Google Drive did not return an id for a created folder!');
		return created.id;
	}

	/**
	 * Resolves the base directory to its folder id, creating missing folders
	 * when `create` is set. Always resolves the real root id (never the `root`
	 * alias) so listing can match ids returned in `parents`.
	 */
	private async ensureBase(create: boolean): Promise<string | undefined> {
		const cached = this.ids.get('/');
		if (cached !== undefined) return cached;
		const rootResponse = await this.requestOrThrow({
			method: 'GET',
			url: buildUrl(DRIVE_API, '/files/root', { fields: 'id' }),
		});
		let currentId = (safeJson(rootResponse) as DriveFile).id;
		if (!currentId) throw new Error('Google Drive did not return the root folder id!');
		for (const segment of this.baseDirectory.split('/').filter((part) => part !== '')) {
			const existing = await this.lookupChild(currentId, segment, true);
			if (existing) currentId = existing.id;
			else if (create) currentId = await this.createFolder(currentId, segment);
			else return undefined;
		}
		this.ids.set('/', currentId);
		return currentId;
	}

	/** Resolves a key to its id; `create` builds missing folders along the way. */
	private async resolveId(key: string, create: boolean): Promise<string | undefined> {
		if (key === '/') return this.ensureBase(create);
		const cached = this.ids.get(key);
		if (cached !== undefined) return cached;
		const parentId = await this.resolveId(dirname(key), create);
		if (parentId === undefined) return undefined;
		const existing = await this.lookupChild(parentId, basename(key), isFolder(key));
		if (existing) {
			this.ids.set(key, existing.id);
			return existing.id;
		}
		if (!create || !isFolder(key)) return undefined;
		const created = await this.createFolder(parentId, basename(key));
		this.ids.set(key, created);
		return created;
	}

	/** Fresh metadata lookup for a file key (also refreshes the id cache). */
	private async resolveEntry(key: string): Promise<DriveFile | undefined> {
		const parentId = await this.resolveId(dirname(key), false);
		if (parentId === undefined) return undefined;
		const entry = await this.lookupChild(parentId, basename(key), isFolder(key));
		if (entry) this.ids.set(key, entry.id);
		return entry;
	}

	private async requireId(key: string): Promise<string> {
		const cached = this.ids.get(key);
		if (cached !== undefined) return cached;
		const id = isFolder(key)
			? await this.resolveId(key, false)
			: (await this.resolveEntry(key))?.id;
		if (id === undefined) throw notFoundError(key);
		return id;
	}

	private cachedKeysUnder(folderKey: string): Array<string> {
		const keys: Array<string> = [];
		for (const cachedKey of this.ids.keys())
			if (cachedKey.startsWith(folderKey) && cachedKey !== folderKey) keys.push(cachedKey);
		return keys;
	}

	private dropCache(key: string): void {
		this.ids.delete(key);
		if (!isFolder(key)) return;
		for (const cachedKey of this.cachedKeysUnder(key)) this.ids.delete(cachedKey);
	}

	private remapCache(oldKey: string, newKey: string): void {
		const id = this.ids.get(oldKey);
		this.ids.delete(oldKey);
		if (id !== undefined) this.ids.set(newKey, id);
		if (!isFolder(oldKey)) return;
		for (const cachedKey of this.cachedKeysUnder(oldKey)) {
			const childId = this.ids.get(cachedKey);
			this.ids.delete(cachedKey);
			if (childId !== undefined)
				this.ids.set(newKey + cachedKey.slice(oldKey.length), childId);
		}
	}

	async read(key: string): Promise<Binary> {
		const id = await this.requireId(key);
		const response = await this.requestOrThrow({
			method: 'GET',
			url: buildUrl(DRIVE_API, `/files/${id}`, { alt: 'media' }),
		});
		return response.bytes();
	}

	async readStream(key: string, { size }: FileStat): Promise<ReadableStream<Binary>> {
		const id = await this.requireId(key);
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
		const existing = await this.resolveEntry(key);
		const modifiedTime = new Date(stat.mtime).toISOString();
		const mimeType = guessMimeType(basename(key));
		let response: RequestResponse;
		if (existing) {
			const { body, contentType } = buildMultipartBody({ modifiedTime }, value, mimeType);
			response = await this.requestOrThrow({
				body,
				headers: { 'Content-Type': contentType },
				method: 'PATCH',
				url: buildUrl(DRIVE_UPLOAD_API, `/files/${existing.id}`, {
					fields: WRITE_FIELDS,
					uploadType: 'multipart',
				}),
			});
		} else {
			const parentId = await this.resolveId(dirname(key), true);
			if (parentId === undefined) throw notFoundError(dirname(key));
			const { body, contentType } = buildMultipartBody(
				{ mimeType, modifiedTime, name: basename(key), parents: [parentId] },
				value,
				mimeType,
			);
			response = await this.requestOrThrow({
				body,
				headers: { 'Content-Type': contentType },
				method: 'POST',
				url: buildUrl(DRIVE_UPLOAD_API, '/files', {
					fields: WRITE_FIELDS,
					uploadType: 'multipart',
				}),
			});
		}
		const file = safeJson(response) as DriveFile;
		if (file.id) this.ids.set(key, file.id);
		return file.md5Checksum ?? `${stat.mtime}~${stat.size}`;
	}

	async writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat): Promise<string> {
		if (stat.size < RESUMABLE_CHUNK_SIZE)
			return this.write(key, await collectStreamToBinary(value), stat);
		const existing = await this.resolveEntry(key);
		const modifiedTime = new Date(stat.mtime).toISOString();
		let file: DriveFile;
		if (existing)
			file = await resumableUpload(
				{
					initiateUrl: buildUrl(DRIVE_UPLOAD_API, `/files/${existing.id}`, {
						fields: WRITE_FIELDS,
						uploadType: 'resumable',
					}),
					metadata: { modifiedTime },
					method: 'PATCH',
					request: this.request,
					stat,
				},
				value,
			);
		else {
			const parentId = await this.resolveId(dirname(key), true);
			if (parentId === undefined) throw notFoundError(dirname(key));
			file = await resumableUpload(
				{
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
					request: this.request,
					stat,
				},
				value,
			);
		}
		if (file.id) this.ids.set(key, file.id);
		return file.md5Checksum ?? `${stat.mtime}~${stat.size}`;
	}

	async delete(key: string): Promise<void> {
		let id: string;
		try {
			id = await this.requireId(key);
		} catch (error) {
			if (getStatus(error) === 404) return;
			throw error;
		}
		try {
			await this.requestOrThrow(
				this.useTrash
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
		const id = await this.requireId(oldKey);
		const oldParentId = await this.resolveId(dirname(oldKey), false);
		const newParentId = await this.resolveId(dirname(newKey), true);
		if (newParentId === undefined) throw notFoundError(dirname(newKey));
		const query: Record<string, string> = { fields: 'id' };
		if (oldParentId !== undefined && oldParentId !== newParentId) {
			query.addParents = newParentId;
			query.removeParents = oldParentId;
		}
		await this.requestOrThrow({
			body: textToUint8Array(JSON.stringify({ name: basename(newKey) })),
			headers: { 'Content-Type': 'application/json; charset=UTF-8' },
			method: 'PATCH',
			url: buildUrl(DRIVE_API, `/files/${id}`, query),
		});
		this.remapCache(oldKey, newKey);
	}

	/**
	 * Drive folders always need an existing parent id, so missing parents are
	 * created regardless of `recursive`.
	 */
	async mkdir(key: string): Promise<void> {
		const id = await this.resolveId(key, true);
		if (id === undefined) throw notFoundError(key);
	}

	async stat(key: string): Promise<Stat> {
		if (key === '/') return { isDir: true, key };
		if (isFolder(key)) {
			const id = await this.resolveId(key, false);
			if (id === undefined) throw notFoundError(key);
			return { isDir: true, key };
		}
		const entry = await this.resolveEntry(key);
		if (!entry) throw notFoundError(key);
		return toFileStat(key, entry);
	}

	async exists(key: string): Promise<boolean> {
		if (key === '/') return true;
		try {
			await this.stat(key);
			return true;
		} catch (error) {
			if (getStatus(error) === 404) return false;
			throw error;
		}
	}

	/**
	 * Fetches every visible file in one paginated query (the `drive.file`
	 * scope limits results to files this module created), then walks the tree
	 * under the requested key so the reporter can steer traversal.
	 */
	async list(key: string, reporter: ListReporter): Promise<Array<Stat>> {
		const startId =
			key === '/' ? await this.ensureBase(true) : await this.resolveId(key, false);
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
			const parsed = safeJson(response) as DriveFileList;
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
				completed = Math.min(completed + 1, total);
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

async function collectStreamToBinary(source: ReadableStream<Binary>): Promise<Binary> {
	const reader = source.getReader();
	const chunks: Array<Binary> = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			total += value.byteLength;
		}
	} finally {
		reader.releaseLock();
	}
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}
