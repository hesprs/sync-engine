import type { Request } from '@/modules/Registrar';
import type { StringKV } from '@/types';

export default function customHeadersMiddleware(request: Request, options: StringKV): Request {
	return (url, params) =>
		request(url, { ...params, headers: { ...params?.headers, ...options } });
}
