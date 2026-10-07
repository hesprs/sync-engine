import type { FileStat, RequestResponse } from '@hesprs/sync-engine-sdk';

export const DRIVE_API = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
export const OAUTH_DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
export const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file openid';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const FILE_FIELDS = 'id,name,mimeType,md5Checksum,modifiedTime,size,parents,appProperties';
export const TOKEN_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export type DriveFile = {
	id: string;
	name: string;
	mimeType: string;
	md5Checksum?: string;
	modifiedTime: string;
	size?: string;
	parents: Array<string>;
	appProperties?: Record<string, string>;
};

export type DriveFileList = {
	files?: Array<DriveFile>;
	nextPageToken?: string;
};

type DriveError = {
	error?: { code?: number; message?: string } | string;
	error_description?: string;
};

/** Escapes a string literal used inside a Drive `q` search expression. */
export function escapeQuery(value: string): string {
	return value.replaceAll('\\', String.raw`\\`).replaceAll("'", String.raw`\'`);
}

export function buildUrl(base: string, path: string, query: Record<string, string> = {}): string {
	const url = new URL(`${base}${path}`);
	for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
	return url.toString();
}

export function getHeader(
	headers: Record<string, string | undefined>,
	name: string,
): string | undefined {
	const entry = Object.entries(headers).find(
		([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
	);
	return entry?.[1];
}

export function parseDriveError(response: RequestResponse): string | undefined {
	try {
		const { error, error_description } = response.json<DriveError>();
		if (typeof error === 'string') return `Google Drive ${error}: ${error_description ?? ''}`;
		if (error?.message)
			return `Google Drive ${error.code ?? response.status}: ${error.message}`;
	} catch {
		// Non-JSON error body (e.g. empty 503 responses).
	}
}

export function toFileStat(
	key: string,
	{ size: fileSize, modifiedTime, appProperties, md5Checksum }: DriveFile,
): FileStat {
	const size = fileSize === undefined ? 0 : Number(fileSize);
	const mtime = new Date(modifiedTime).valueOf();
	return {
		isDir: false,
		key,
		meta: () => appProperties ?? {},
		mtime,
		size,
		uid: md5Checksum ?? `${mtime}~${size}`,
	};
}
