import { requestUrl } from 'obsidian';
import type { AuthHttp } from './auth';

/** `AuthHttp` implementation backed by Obsidian's CORS-free `requestUrl`. */
const requestUrlHttp: AuthHttp = async ({ url, method, body, contentType }) => {
	const response = await requestUrl({ body, contentType, method, throw: false, url });
	return { json: () => response.json as unknown, status: response.status };
};

export default requestUrlHttp;
