import type { Request } from '@hesprs/sync-engine-sdk';
import { toError } from '@repo/shared/error';
import { normalizeUrl } from '@repo/shared/path';
import { buildUrl, getAuthorization, parseWebDAVError } from './utils';

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
	{ username, password, endpoint }: WebdavConnectionOptions,
	request: Request,
): Promise<void | Error> {
	const Authorization = getAuthorization(username, password);
	try {
		const response = await request(buildUrl(normalizeUrl(endpoint), '/'), {
			body: CHECK_CONNECTION_BODY,
			contentType: 'application/xml',
			headers: { Authorization, Depth: '0' },
			method: 'PROPFIND',
			throw: false,
		});
		if (response.status === 200 || response.status === 207) return;
		return new Error(parseWebDAVError(response.text()) ?? `HTTP ${response.status}`);
	} catch (error) {
		return toError(error);
	}
}
