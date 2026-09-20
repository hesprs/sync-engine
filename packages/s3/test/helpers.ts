import type { Binary } from '@hesprs/sync-engine-sdk';
import type { ResponseOverrides } from '@hesprs/sync-engine-sdk/dev';
import { openMemoryDB } from 'uni-kv';

export const memoryDB = openMemoryDB<
	Record<string, unknown>,
	{ s3Key?: Binary; s3KeyMarker?: string }
>('s3-test');

export const emptyBinary: Binary = new Uint8Array(0);

export const defaultS3Options = {
	accessKeyId: 'access-key',
	bucket: 'vault',
	endpoint: 'https://s3.example.com',
	region: 'us-east-1',
	secretAccessKey: 'secret-key',
	sessionToken: 'session-token',
	urlStyle: 'path',
} as const;

export const defaultCredentials = {
	accessKeyId: defaultS3Options.accessKeyId,
	region: defaultS3Options.region,
	secretAccessKey: defaultS3Options.secretAccessKey,
	service: 's3',
	sessionToken: defaultS3Options.sessionToken,
} as const;

export function response(
	options: {
		body?: Binary;
		headers?: Record<string, string>;
		status?: number;
		text?: string;
	} = {},
): ResponseOverrides {
	return {
		bytes: () => options.body ?? emptyBinary,
		headers: options.headers ?? {},
		status: options.status ?? 200,
		text: () => options.text ?? '',
	};
}
