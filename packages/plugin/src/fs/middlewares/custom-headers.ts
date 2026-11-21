import type { StringKV } from '@/types';
import type { Request } from '@/utils/native';

export default function customHeadersMiddleware(request: Request, options: StringKV): Request {
	return (url, params) =>
		request(url, { ...params, headers: { ...params?.headers, ...options } });
}
