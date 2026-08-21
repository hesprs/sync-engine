import type { Binary, Request, RequestParam, RequestResponse } from '@hesprs/sync-engine-sdk';
import { md5 } from 'hash-wasm';

export type MockFile = {
	id: string;
	name: string;
	mimeType: string;
	parents: Array<string>;
	content?: Uint8Array;
	modifiedTime: string;
	trashed: boolean;
};

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const latin1 = new TextDecoder('latin1');

export function jsonResponse(status: number, value: unknown): RequestResponse {
	const text = JSON.stringify(value);
	return {
		bytes: () => encoder.encode(text),
		headers: { 'content-type': 'application/json' },
		json: () => JSON.parse(text) as unknown,
		status,
		text: () => text,
	};
}

function bytesResponse(status: number, content: Uint8Array): RequestResponse {
	return {
		bytes: () => new Uint8Array(content),
		headers: { 'content-type': 'application/octet-stream' },
		json: () => JSON.parse(decoder.decode(content)) as unknown,
		status,
		text: () => decoder.decode(content),
	};
}

function emptyResponse(status: number, headers: Record<string, string> = {}): RequestResponse {
	return {
		bytes: () => new Uint8Array(0),
		headers,
		json: () => ({}),
		status,
		text: () => '',
	};
}

function notFound(): RequestResponse {
	return jsonResponse(404, { error: { code: 404, message: 'File not found.' } });
}

function unescapeQueryLiteral(value: string): string {
	return value.replaceAll(/\\(?<escaped>['\\])/gu, '$<escaped>');
}

function toBinary(body: RequestParam['body']): Uint8Array {
	if (body === undefined) return new Uint8Array(0);
	if (typeof body === 'string') return encoder.encode(body);
	return body;
}

type MultipartParts = { metadata: Record<string, unknown>; content: Uint8Array };

/** Latin1 decoding maps one byte to one char, so string indexes equal byte offsets. */
function parseMultipart(body: Uint8Array, contentType: string): MultipartParts {
	const boundary = contentType.split('boundary=')[1];
	if (!boundary) throw new Error('mock: missing multipart boundary');
	const text = latin1.decode(body);
	const delimiter = `--${boundary}`;
	const firstHeaderEnd = text.indexOf('\r\n\r\n');
	const secondDelimiter = text.indexOf(delimiter, firstHeaderEnd);
	const metadataText = text.slice(firstHeaderEnd + 4, secondDelimiter);
	const secondHeaderEnd = text.indexOf('\r\n\r\n', secondDelimiter);
	const closingDelimiter = text.lastIndexOf(`\r\n${delimiter}--`);
	const metadata = JSON.parse(metadataText.trimEnd()) as Record<string, unknown>;
	const content = body.slice(secondHeaderEnd + 4, closingDelimiter);
	return { content, metadata };
}

type ResumableSession = {
	targetId?: string;
	metadata: Record<string, unknown>;
	received: Array<Uint8Array>;
};

async function serialize(file: MockFile): Promise<Record<string, unknown>> {
	return {
		id: file.id,
		md5Checksum:
			file.mimeType === FOLDER_MIME || file.content === undefined
				? undefined
				: await md5(file.content),
		mimeType: file.mimeType,
		modifiedTime: file.modifiedTime,
		name: file.name,
		parents: file.parents,
		size: file.content === undefined ? undefined : String(file.content.byteLength),
	};
}

/**
 * In-memory Google Drive REST v3 covering the subset the module uses: files
 * lookup/list queries, media downloads with ranges, multipart and resumable
 * uploads, metadata patches, deletes, `files/root`, and `about`.
 */
export class MockDrive {
	readonly files = new Map<string, MockFile>();
	readonly rootId = 'root-id-0001';
	requestLog: Array<RequestParam> = [];
	failNext: RequestResponse | undefined;
	private idCounter = 0;
	private readonly sessions = new Map<string, ResumableSession>();

	readonly request: Request = (params) => {
		const normalized: RequestParam = typeof params === 'string' ? { url: params } : params;
		this.requestLog.push(normalized);
		if (this.failNext) {
			const response = this.failNext;
			this.failNext = undefined;
			return Promise.resolve(response);
		}
		return this.route(normalized);
	};

	addFolder(name: string, parentId: string): MockFile {
		const folder: MockFile = {
			id: this.nextId(),
			mimeType: FOLDER_MIME,
			modifiedTime: new Date(0).toISOString(),
			name,
			parents: [parentId],
			trashed: false,
		};
		this.files.set(folder.id, folder);
		return folder;
	}

	addFile(
		name: string,
		parentId: string,
		content: string,
		modifiedTime = new Date(0).toISOString(),
	): MockFile {
		const file: MockFile = {
			content: encoder.encode(content),
			id: this.nextId(),
			mimeType: 'text/plain',
			modifiedTime,
			name,
			parents: [parentId],
			trashed: false,
		};
		this.files.set(file.id, file);
		return file;
	}

	fileByPath(path: string): MockFile | undefined {
		let parentId = this.rootId;
		const segments = path.split('/').filter((segment) => segment !== '');
		let current: MockFile | undefined;
		for (const segment of segments) {
			current = [...this.files.values()].find(
				(file) => !file.trashed && file.parents[0] === parentId && file.name === segment,
			);
			if (!current) return undefined;
			parentId = current.id;
		}
		return current;
	}

	contentByPath(path: string): string | undefined {
		const file = this.fileByPath(path);
		return file?.content === undefined ? undefined : decoder.decode(file.content);
	}

	private nextId(): string {
		this.idCounter++;
		return `id-${this.idCounter.toString().padStart(4, '0')}`;
	}

	private async route(params: RequestParam): Promise<RequestResponse> {
		const url = new URL(params.url);
		const method = params.method ?? 'GET';
		const path = url.pathname;
		if (path === '/token' || url.host === 'oauth2.googleapis.com')
			throw new Error(`mock: unexpected OAuth call ${params.url}`);
		if (path.startsWith('/mock-session/')) return this.routeSession(params, url);
		if (path === '/drive/v3/about')
			return jsonResponse(200, { user: { emailAddress: 'mock@example.com' } });
		if (path === '/drive/v3/files/root') return jsonResponse(200, { id: this.rootId });
		if (path === '/drive/v3/files' && method === 'GET') return this.routeQuery(url);
		if (path === '/drive/v3/files' && method === 'POST')
			return this.routeCreateMetadata(params);
		if (path === '/upload/drive/v3/files' && method === 'POST')
			return this.routeUpload(params, url);
		const uploadMatch = /^\/upload\/drive\/v3\/files\/(?<id>[^/]+)$/u.exec(path);
		if (uploadMatch && method === 'PATCH')
			return this.routeUpload(params, url, uploadMatch.groups?.id);
		const fileMatch = /^\/drive\/v3\/files\/(?<id>[^/]+)$/u.exec(path);
		if (fileMatch) return this.routeFile(params, url, fileMatch.groups?.id ?? '', method);
		throw new Error(`mock: unhandled route ${method} ${params.url}`);
	}

	private async routeQuery(url: URL): Promise<RequestResponse> {
		const q = url.searchParams.get('q') ?? '';
		const lookup =
			/^'(?<parent>.+)' in parents and name = '(?<name>.*)' and trashed = false and mimeType (?<op>=|!=) '(?<mime>.+)'$/u.exec(
				q,
			);
		if (lookup?.groups) {
			const parent = unescapeQueryLiteral(lookup.groups.parent ?? '');
			const name = unescapeQueryLiteral(lookup.groups.name ?? '');
			const wantFolder = lookup.groups.op === '=';
			const matches = [...this.files.values()]
				.filter(
					(file) =>
						!file.trashed &&
						file.parents[0] === (parent === 'root' ? this.rootId : parent) &&
						file.name === name &&
						(file.mimeType === FOLDER_MIME) === wantFolder,
				)
				.sort((a, b) => Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime));
			return jsonResponse(200, {
				files: await Promise.all(matches.map((file) => serialize(file))),
			});
		}
		if (q === 'trashed = false') {
			const pageSize = 2; // Force pagination so tests cover it.
			const all = [...this.files.values()].filter((file) => !file.trashed);
			const start = Number.parseInt(url.searchParams.get('pageToken') ?? '0');
			const page = all.slice(start, start + pageSize);
			const nextIndex = start + pageSize;
			return jsonResponse(200, {
				files: await Promise.all(page.map((file) => serialize(file))),
				nextPageToken: nextIndex < all.length ? String(nextIndex) : undefined,
			});
		}
		throw new Error(`mock: unhandled query ${q}`);
	}

	private async routeCreateMetadata(params: RequestParam): Promise<RequestResponse> {
		const metadata = JSON.parse(decoder.decode(toBinary(params.body))) as {
			mimeType?: string;
			name?: string;
			parents?: Array<string>;
		};
		if (metadata.mimeType !== FOLDER_MIME)
			throw new Error('mock: metadata-only create supports folders only');
		const folder = this.addFolder(metadata.name ?? '', metadata.parents?.[0] ?? this.rootId);
		return jsonResponse(200, await serialize(folder));
	}

	private async routeUpload(
		params: RequestParam,
		url: URL,
		targetId?: string,
	): Promise<RequestResponse> {
		const uploadType = url.searchParams.get('uploadType');
		if (uploadType === 'multipart') {
			const contentType = params.headers?.['Content-Type'] ?? '';
			const { metadata, content } = parseMultipart(toBinary(params.body), contentType);
			return jsonResponse(
				200,
				await serialize(this.applyUpload(targetId, metadata, content)),
			);
		}
		if (uploadType === 'resumable') {
			const metadata = JSON.parse(decoder.decode(toBinary(params.body))) as Record<
				string,
				unknown
			>;
			const sessionId = `session-${this.sessions.size + 1}`;
			this.sessions.set(sessionId, { metadata, received: [], targetId });
			return emptyResponse(200, {
				location: `https://mock.googleapis.com/mock-session/${sessionId}`,
			});
		}
		throw new Error(`mock: unhandled upload type ${uploadType ?? 'none'}`);
	}

	private async routeSession(params: RequestParam, url: URL): Promise<RequestResponse> {
		const sessionId = url.pathname.split('/').pop() ?? '';
		const session = this.sessions.get(sessionId);
		if (!session) return notFound();
		if (params.method === 'DELETE') {
			this.sessions.delete(sessionId);
			return emptyResponse(204);
		}
		const range = /^bytes (?<start>\d+)-(?<end>\d+)\/(?<total>\d+|\*)$/u.exec(
			params.headers?.['Content-Range'] ?? '',
		);
		if (!range?.groups) throw new Error('mock: resumable PUT without Content-Range');
		session.received.push(toBinary(params.body));
		const receivedBytes = session.received.reduce((sum, chunk) => sum + chunk.byteLength, 0);
		const end = Number.parseInt(range.groups.end ?? '0');
		if (receivedBytes < end + 1) throw new Error('mock: resumable chunks out of order');
		const total = range.groups.total;
		if (total !== '*' && receivedBytes >= Number.parseInt(total)) {
			const content = new Uint8Array(receivedBytes);
			let offset = 0;
			for (const chunk of session.received) {
				content.set(chunk, offset);
				offset += chunk.byteLength;
			}
			this.sessions.delete(sessionId);
			return jsonResponse(
				200,
				await serialize(this.applyUpload(session.targetId, session.metadata, content)),
			);
		}
		return emptyResponse(308);
	}

	private applyUpload(
		targetId: string | undefined,
		metadata: Record<string, unknown>,
		content: Uint8Array,
	): MockFile {
		if (targetId !== undefined) {
			const existing = this.files.get(targetId);
			if (!existing) throw new Error(`mock: upload to missing file ${targetId}`);
			existing.content = content;
			if (typeof metadata.modifiedTime === 'string')
				existing.modifiedTime = metadata.modifiedTime;
			return existing;
		}
		const file: MockFile = {
			content,
			id: this.nextId(),
			mimeType: typeof metadata.mimeType === 'string' ? metadata.mimeType : 'text/plain',
			modifiedTime:
				typeof metadata.modifiedTime === 'string'
					? metadata.modifiedTime
					: new Date(0).toISOString(),
			name: typeof metadata.name === 'string' ? metadata.name : '',
			parents: Array.isArray(metadata.parents) ? (metadata.parents as Array<string>) : [],
			trashed: false,
		};
		this.files.set(file.id, file);
		return file;
	}

	private async routeFile(
		params: RequestParam,
		url: URL,
		id: string,
		method: string,
	): Promise<RequestResponse> {
		const file = this.files.get(id);
		if (!file || (file.trashed && method !== 'DELETE')) return notFound();
		if (method === 'GET' && url.searchParams.get('alt') === 'media') {
			const content = file.content ?? new Uint8Array(0);
			const range = /^bytes=(?<start>\d+)-(?<end>\d+)$/u.exec(params.headers?.Range ?? '');
			if (range?.groups) {
				const start = Number.parseInt(range.groups.start ?? '0');
				const end = Number.parseInt(range.groups.end ?? '0');
				return bytesResponse(206, content.slice(start, end + 1));
			}
			return bytesResponse(200, content);
		}
		if (method === 'GET') return jsonResponse(200, await serialize(file));
		if (method === 'DELETE') {
			this.files.delete(id);
			return emptyResponse(204);
		}
		if (method === 'PATCH') {
			const metadata = JSON.parse(decoder.decode(toBinary(params.body))) as {
				name?: string;
				trashed?: boolean;
			};
			if (typeof metadata.name === 'string') file.name = metadata.name;
			if (metadata.trashed === true) file.trashed = true;
			const addParents = url.searchParams.get('addParents');
			const removeParents = url.searchParams.get('removeParents');
			if (addParents)
				file.parents = [
					addParents,
					...file.parents.filter((parent) => parent !== removeParents),
				];
			return jsonResponse(200, await serialize(file));
		}
		throw new Error(`mock: unhandled file route ${method} ${params.url}`);
	}
}
