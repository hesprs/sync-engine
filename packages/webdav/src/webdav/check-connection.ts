import type { CheckConnectionResult, Request } from '@hesprs/sync-engine-sdk';
import { normalizeUrl } from '@repo/shared/path';
import { buildUrl, getAuthorization } from './utils';

export type WebdavConnectionOptions = {
	endpoint: string;
	password: string;
	username: string;
};

const CHECK_CONNECTION_BODY = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:propname/>
</D:propfind>`;

export async function checkConnection(
	options: WebdavConnectionOptions,
	request: Request,
): Promise<CheckConnectionResult> {
	const Authorization = getAuthorization(options.username, options.password);
	try {
		const response = await request({
			body: CHECK_CONNECTION_BODY,
			contentType: 'application/xml',
			headers: { Authorization, Depth: '0' },
			method: 'PROPFIND',
			throw: false,
			url: buildUrl(normalizeUrl(options.endpoint), '/'),
		});
		if (response.status === 200 || response.status === 207) return { success: true } as const;
		return { reason: response.status.toString(), success: false } as const;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return { reason: errorMessage, success: false } as const;
	}
}
