import { stripEndSlash } from '@repo/shared/path';
import type { Request, RequestParam, RequestResponse, Stat } from '@hesprs/sync-engine-sdk';

export const API_RPC = 'https://api.dropboxapi.com';
export const API_CONTENT = 'https://content.dropboxapi.com';
export const OAUTH_AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize';
export const OAUTH_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';

type DropboxError = {
	error_summary?: string;
	error?: Record<string, unknown> | string;
	error_description?: string;
};

export type ListFolderResult = { cursor: string; entries: Array<Metadata>; has_more: boolean };

export type FileMetadata = {
	name: string;
	id: string;
	rev: string;
	client_modified: string;
	server_modified: string;
	size: number;
	path_display?: string;
	path_lower?: string;
	content_hash?: string;
};

export type FolderMetadata = {
	name: string;
	id: string;
	path_display?: string;
	path_lower?: string;
};

export type Metadata =
	| ({ '.tag': 'file' } & FileMetadata)
	| ({ '.tag': 'folder' } & FolderMetadata);

export type UploadArg = {
	path: string;
	mode: 'overwrite';
	autorename: boolean;
	client_modified?: string;
	mute: boolean;
};

export type DeleteBatchEntry =
	| { '.tag': 'success'; metadata: Metadata }
	| { '.tag': 'failure'; failure: Record<string, unknown> };

export type RelocationBatchEntry =
	| { '.tag': 'success'; success: Metadata }
	| { '.tag': 'failure'; failure: Record<string, unknown> };

export type CreateFolderBatchEntry =
	| { '.tag': 'success'; metadata: FolderMetadata }
	| { '.tag': 'failure'; failure: Record<string, unknown> };

export type FinishBatchEntry =
	| ({ '.tag': 'success' } & FileMetadata)
	| { '.tag': 'failure'; failure: Record<string, unknown> };

export type BatchEntry =
	| DeleteBatchEntry
	| RelocationBatchEntry
	| CreateFolderBatchEntry
	| FinishBatchEntry;

/** Dropbox paths are relative to the app folder root and never end with a slash. */
export function keyToPath(key: string): string {
	if (key === '/') return '';
	return `/${stripEndSlash(key)}`;
}

/**
 * Serializes an argument for the `Dropbox-API-Arg` header; non-ASCII and 0x7F are `\uXXXX`-escaped
 * to stay HTTP-header-safe.
 */
export function escapeHeaderJson(arg: Record<string, unknown>): string {
	return JSON.stringify(arg).replaceAll(
		/[\u007F-\uFFFF]/gu,
		(char) => `\\u${(char.codePointAt(0) as number).toString(16).padStart(4, '0')}`,
	);
}

/** Returns the chain of `.tag` values of a Dropbox error union, e.g. `path_lookup/not_found`. */
function collectTags(error: unknown): Array<string> {
	const tags: Array<string> = [];
	let current = error as Record<string, unknown> | undefined;
	if (current !== null && typeof current === 'object' && typeof current['.tag'] !== 'string')
		// Rate-limit bodies wrap the union tag in `reason` instead of the top level.
		current = current.reason as Record<string, unknown> | undefined;
	while (current !== null && typeof current === 'object' && tags.length < 8) {
		const tag = current['.tag'];
		if (typeof tag !== 'string') break;
		tags.push(tag);
		current = current[tag] as Record<string, unknown> | undefined;
	}
	return tags;
}

export function tagsOf(error: unknown): Array<string> {
	return (error as { tags?: Array<string> }).tags ?? [];
}

function describeError(data: DropboxError): string | undefined {
	if (typeof data.error === 'string')
		return `Dropbox ${data.error}${data.error_description ? `: ${data.error_description}` : ''}`;
	const tags = collectTags(data.error);
	if (tags.length > 0) return `Dropbox ${tags.join('/')}`;
	if (typeof data.error_summary === 'string') return `Dropbox ${data.error_summary}`;
}

function requestErrorOf(
	response: RequestResponse,
): Error & { status: number; tags: Array<string> } {
	let data: DropboxError = {};
	try {
		data = response.json<DropboxError>();
	} catch {
		// Non-JSON error body.
	}
	const error = new Error(describeError(data) ?? `HTTP ${response.status}`) as Error & {
		status: number;
		tags: Array<string>;
	};
	error.status = response.status;
	error.tags = collectTags(data.error);
	return error;
}

/** Sends a request and returns its 2xx response, throwing a structured Dropbox error otherwise. */
export async function request2xx(
	request: Request,
	url: string,
	params: RequestParam,
): Promise<RequestResponse> {
	const response = await request(url, { ...params, throw: false });
	if (response.status >= 200 && response.status < 300) return response;
	throw requestErrorOf(response);
}

/** Sends a JSON POST to the RPC host and returns its 2xx response. */
export async function rpc(
	request: Request,
	path: string,
	body: Record<string, unknown>,
): Promise<RequestResponse> {
	return request2xx(request, `${API_RPC}${path}`, {
		body: JSON.stringify(body),
		headers: { 'Content-Type': 'application/json' },
		method: 'POST',
	});
}

/** Dropbox batch endpoints accept at most 1000 entries per request (`files.stone`). */
export const BATCH_LIMIT = 1000;

export function chunksOf<T>(items: Array<T>, size: number): Array<Array<T>> {
	const chunks: Array<Array<T>> = [];
	for (let index = 0; index < items.length; index += size)
		chunks.push(items.slice(index, index + size));
	return chunks;
}

export function verifyEntries<T extends BatchEntry>(
	entries: Array<T> | undefined,
	expected: number,
): Array<T> {
	if (entries?.length !== expected) throw new Error('Dropbox batch returned a malformed result.');
	return entries;
}

export function batchEntryError(failure: Record<string, unknown>): Error & { tags: Array<string> } {
	const tags = collectTags(failure);
	const error = new Error(
		tags.length > 0 ? `Dropbox ${tags.join('/')}` : 'Dropbox operation failed.',
	) as Error & { tags: Array<string> };
	error.tags = tags;
	return error;
}

export function uidOf({ client_modified, content_hash, rev, size }: FileMetadata): string {
	return content_hash ?? rev ?? `${Date.parse(client_modified)}~${size}`;
}

export function toStat(key: string, metadata: Metadata): Stat {
	if (metadata['.tag'] === 'folder') return { isDir: true, key, meta: () => ({}) };
	const mtime = Date.parse(metadata.client_modified);
	return {
		isDir: false,
		key,
		meta: () => ({ mtime: String(mtime) }),
		mtime,
		size: metadata.size,
		uid: uidOf(metadata),
	};
}
