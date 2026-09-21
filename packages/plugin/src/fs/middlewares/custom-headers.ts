import type { Request } from '@/modules/Registrar';

type CustomHeadersOptions = Record<string, string>;

export default function customHeadersMiddleware(
	request: Request,
	options: CustomHeadersOptions,
): Request {
	return (url, params) =>
		request(url, { ...params, headers: { ...params?.headers, ...options } });
}
