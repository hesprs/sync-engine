// #region Normalize Path
export function normalizeKey(path: string, isDir: boolean) {
	const noSlashes = path
		.normalize('NFC')
		.split('/')
		.filter((segment) => segment !== '')
		.join('/');
	return isDir ? `${noSlashes}/` : noSlashes;
}

export function normalizeBaseDir(path: string): string {
	return normalizeKey(path, true);
}
// #endregion ======================================================================

// #region File key potations
export function dirname(key: string) {
	if (key === '/') return '/';
	if (key.endsWith('/')) key = key.slice(0, -1);
	const lastSlashIndex = key.lastIndexOf('/');
	return lastSlashIndex <= 0 ? '/' : key.slice(0, lastSlashIndex + 1);
}

export function basename(key: string): string {
	if (key === '/') return '';
	if (key.endsWith('/')) key = key.slice(0, -1);
	const lastSlashIndex = key.lastIndexOf('/');
	return key.slice(lastSlashIndex + 1);
}

export function stripEndSlash(key: string) {
	if (key.endsWith('/')) return key.slice(0, -1);
	return key;
}

export function isSub(parent: string, sub: string, include = false) {
	if (sub === parent) return include;
	return parent === '/' || (sub.startsWith(parent) && sub.length > parent.length);
}

export function isFolder(key: string) {
	return key.endsWith('/');
}
// #endregion ======================================================================

// #region URL
// Encodes every character outside RFC 3986 unreserved set, keeping existing %XX escapes intact.
export function encodeUrlPart(part: string) {
	return part.replaceAll(/%[\dA-Fa-f]{2}|[^\w\-.~]/gu, (match) =>
		match.length === 3
			? match
			: encodeURIComponent(match)
					.replaceAll('!', '%21')
					.replaceAll("'", '%27')
					.replaceAll('(', '%28')
					.replaceAll(')', '%29')
					.replaceAll('*', '%2A'),
	);
}

function encodePath(value: string, delimiter = '/') {
	return value.split(delimiter).map(encodeUrlPart).join(delimiter);
}
export function parseUrl(value: string, tolerateNonUrl = false): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		if (!tolerateNonUrl) throw new Error(`Invalid URL ${value}`);
		return encodePath(value);
	}
	const { pathname, search, hash, protocol } = url;
	const encodedRest = `${encodePath(pathname).replace(/\/+$/u, '')}${
		search
			? `?${search
					.slice(1)
					.split('&')
					.map((param) => encodePath(param, '='))
					.join('&')}`
			: ''
	}${hash ? `#${encodeUrlPart(hash.slice(1))}` : ''}`;
	try {
		decodeURIComponent(encodedRest);
	} catch {
		throw new Error(`Invalid URL ${value}`);
	}
	// URL makes the hostname punycode, so take it raw.
	const hostname = /^[^:]+:\/\/(?<hostname>[^/?#]*)/u.exec(value)?.groups?.hostname ?? '';
	return `${protocol}//${hostname.toLowerCase()}${encodedRest}`;
}

export function formatUrl(value: string): string {
	return decodeURIComponent(value);
}

export function compileQuery(dict: Record<string, string>) {
	return Object.entries(dict)
		.map(([key, value]) => `${encodeUrlPart(key)}=${encodeUrlPart(value)}`)
		.join('&');
}
// #endregion ======================================================================
