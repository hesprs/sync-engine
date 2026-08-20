import type { Binary, RequestResponse } from '@hesprs/sync-engine-sdk';

export const emptyBinary: Binary = new Uint8Array(0);

export const defaultResponse: RequestResponse = {
	bytes: () => emptyBinary,
	headers: {},
	json: () => void 0,
	status: 200,
	text: () => '',
};

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
): RequestResponse {
	return {
		bytes: () => options.body ?? emptyBinary,
		headers: options.headers ?? {},
		json: () => void 0,
		status: options.status ?? 200,
		text: () => options.text ?? '',
	};
}
