import { encodeUrl, encodeURIComponent3986 } from '@repo/shared/path';

export type BackendSettings = {
	remoteFs: string;
	modules: Record<string, object> & {
		s3?: { endpoint?: string; bucket?: string; urlStyle?: string; fetchObjectMeta?: boolean };
		encryption?: { enabled?: boolean };
	};
	realtimeSyncFastMode?: boolean;
};
export type Target = {
	fetchObjectMeta: boolean;
	url: (key: string) => string;
	contains: (url: string) => boolean;
};

// Match the existing backend URL conventions using their public settings. Keys
// Here are already transformed by prefix, encryption and asymmetric wrappers.
export function getTarget(settings: BackendSettings): Target | undefined {
	const config = settings.modules.s3;
	if (settings.remoteFs !== 's3' || !config?.endpoint || !config.bucket) return;
	const endpoint = new URL(config.endpoint);
	const root = canonicalUrl(
		config.urlStyle === 'path'
			? `${config.endpoint}/${config.bucket}/`
			: `${endpoint.protocol}//${config.bucket}.${endpoint.host}/`,
	);
	return {
		contains: (url) => canonicalUrl(url).startsWith(root),
		fetchObjectMeta: config.fetchObjectMeta ?? false,
		url: (key) => canonicalUrl(root + (key === '/' ? '' : encodeUrl(key))),
	};
}

export function canonicalUrl(value: string, base?: string): string {
	const url = new URL(value, base);
	return (
		url.origin +
		url.pathname
			.split('/')
			.map((part) => encodeURIComponent3986(decodeURIComponent(part)))
			.join('/')
	);
}

export function header(headers: Record<string, string>, name: string): string | undefined {
	return Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

export function setHeaders(headers: Record<string, string>, values: Record<string, string>) {
	const names = new Set(Object.keys(values).map((key) => key.toLowerCase()));
	return {
		...Object.fromEntries(
			Object.entries(headers).filter(([key]) => !names.has(key.toLowerCase())),
		),
		...values,
	};
}
