import { encodeUrl, encodeURIComponent3986, normalizeUrl } from '@repo/shared/path';

export type BackendSettings = { remoteFs: string; modules: Record<string, object> };
export type Target = {
	kind: 's3' | 'webdav';
	url: (key: string) => string;
	contains: (url: string) => boolean;
};

// Match the existing backend URL conventions using their public settings. Keys
// Here are already transformed by prefix, encryption and asymmetric wrappers.
export function getTarget(settings: BackendSettings): Target | undefined {
	const { remoteFs, modules } = settings;
	if (remoteFs !== 's3' && remoteFs !== 'webdav') return;
	const config = modules[remoteFs] as
		| {
				endpoint?: string;
				bucket?: string;
				urlStyle?: string;
		  }
		| undefined;
	if (!config?.endpoint) return;
	let root: string;
	if (remoteFs === 'webdav') root = `${normalizeUrl(config.endpoint)}/`;
	else {
		if (!config.bucket) return;
		if (config.urlStyle === 'path') root = `${config.endpoint}/${config.bucket}/`;
		else {
			const endpoint = new URL(config.endpoint);
			root = `${endpoint.protocol}//${config.bucket}.${endpoint.host}/`;
		}
	}
	root = canonicalUrl(root);
	return {
		contains: (url) => canonicalUrl(url).startsWith(root),
		kind: remoteFs,
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
