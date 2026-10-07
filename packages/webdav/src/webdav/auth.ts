import type { Request } from '@hesprs/sync-engine-sdk';

export default function authorizationMiddleware(
	request: Request,
	{ username, password }: { username: string; password: string },
): Request {
	const Authorization = `Basic ${btoa(`${username}:${password}`)}`;
	return async (url, params) =>
		request(url, { ...params, headers: { ...params?.headers, Authorization } });
}
