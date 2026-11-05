import { API_RPC, request2xx } from './api';
import { toError } from '@repo/shared/error';
import type { Request } from '@hesprs/sync-engine-sdk';

/** Validates the token by listing the app folder root, the lightest permission-honoring call. */
export default async function checkConnection(request: Request): Promise<void | Error> {
	try {
		await request2xx(request, `${API_RPC}/2/files/list_folder`, {
			body: JSON.stringify({ path: '' }),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
		});
	} catch (error) {
		return toError(error);
	}
}
