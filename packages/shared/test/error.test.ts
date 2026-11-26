import { isNotFound } from '@/error';
import { expect, test } from 'bun:test';

function errorWithStatus(message: string, status: number): Error & { status: number } {
	const error = new Error(message) as Error & { status: number };
	error.status = status;
	return error;
}

test('isNotFound detects HTTP 404, POSIX ENOENT, S3 NoSuchKey, and Dropbox path/not_found', () => {
	expect(isNotFound(errorWithStatus('Not found', 404))).toBe(true);
	expect(isNotFound(new Error('ENOENT: no such file'))).toBe(true);
	expect(isNotFound(new Error('S3 NoSuchKey: The specified key does not exist'))).toBe(true);
	expect(isNotFound(errorWithStatus('Dropbox path/not_found', 409))).toBe(true);
	expect(isNotFound(errorWithStatus('Dropbox path/conflict', 409))).toBe(false);
	expect(isNotFound(errorWithStatus('Forbidden', 403))).toBe(false);
	expect(isNotFound(errorWithStatus('Moved Permanently', 301))).toBe(false);
});
