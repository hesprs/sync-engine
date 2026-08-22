import type { CheckConnectionResult, Request } from '@hesprs/sync-engine-sdk';
import { DRIVE_API, buildUrl, parseDriveError } from './api';

export default async function checkConnection(request: Request): Promise<CheckConnectionResult> {
	try {
		const response = await request({
			method: 'GET',
			throw: false,
			url: buildUrl(DRIVE_API, '/about', { fields: 'storageQuota' }),
		});
		if (response.status >= 200 && response.status < 300) return { success: true } as const;
		return {
			reason: parseDriveError(response) ?? `HTTP ${response.status}`,
			success: false,
		} as const;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return { reason: errorMessage, success: false } as const;
	}
}
