import { rpc } from './api';
import { toError } from '@repo/shared/error';
import type { Request } from '@hesprs/sync-engine-sdk';

/** Validates the token by listing the app folder root, the lightest permission-honoring call. */
export default async function checkConnection(request: Request): Promise<void | Error> {
	try {
		await rpc(request, '/2/files/list_folder', { path: '' });
	} catch (error) {
		return toError(error);
	}
}
