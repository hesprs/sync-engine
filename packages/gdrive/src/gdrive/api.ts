import type { FileStat, RequestResponse } from '@hesprs/sync-engine-sdk';

export const DRIVE_API = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
export const OAUTH_DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
export const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file email';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const FILE_FIELDS = 'id,name,mimeType,md5Checksum,modifiedTime,size,parents';

export type DriveFile = {
	id: string;
	name: string;
	mimeType: string;
	md5Checksum?: string;
	modifiedTime?: string;
	size?: string;
	parents?: Array<string>;
};

export type DriveFileList = {
	files?: Array<DriveFile>;
	nextPageToken?: string;
};

const mtimeMissing = new Error('Google Drive did not return the modified time for a file!');

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
	const parsed = response as {
		error?: { code?: number; message?: string } | string;
		error_description?: string;
	};
	if (typeof parsed.error === 'string')
		return `Google Drive ${parsed.error}: ${parsed.error_description ?? ''}`;
	if (parsed.error?.message)
		return `Google Drive ${parsed.error.code ?? response.status}: ${parsed.error.message}`;
}

export function toFileStat(key: string, file: DriveFile): FileStat {
	if (!file.modifiedTime) throw mtimeMissing;
	const mtime = new Date(file.modifiedTime).valueOf();
	const size = file.size === undefined ? 0 : Number.parseInt(file.size);
	return { isDir: false, key, mtime, size, uid: file.md5Checksum ?? `${mtime}~${size}` };
}
