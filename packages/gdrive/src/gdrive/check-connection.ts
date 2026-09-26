import type { Request } from '@hesprs/sync-engine-sdk';
import { toError } from '@repo/shared/error';
import { DRIVE_API, buildUrl, parseDriveError } from './api';

export default async function checkConnection(request: Request): Promise<void | Error> {
	try {
		const response = await request(buildUrl(DRIVE_API, '/about', { fields: 'storageQuota' }), {
			method: 'GET',
			throw: false,
		});
		if (response.status >= 200 && response.status < 300) return;
		return new Error(parseDriveError(response) ?? `HTTP ${response.status}`);
	} catch (error) {
		return toError(error);
	}
}
