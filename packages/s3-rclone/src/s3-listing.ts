import type { RequestResponse } from '@hesprs/sync-engine-sdk';
import { objectInfo, objectUid } from './s3';

type PageState = { keys: Set<string>; tokens: Set<string> };

function children(parent: Element, name: string) {
	return [...parent.children].filter((element) => element.localName === name);
}

function text(parent: Element, name: string) {
	return children(parent, name)[0]?.textContent ?? undefined;
}

function addParents(key: string, scope: string, folders: Set<string>) {
	for (
		let slash = key.indexOf('/', scope.length);
		slash !== -1;
		slash = key.indexOf('/', slash + 1)
	)
		folders.add(key.slice(0, slash + 1));
}

export default class S3Listing {
	private readonly pages = new Map<string, PageState>();

	clear() {
		this.pages.clear();
	}

	normalize(response: RequestResponse, url: string): RequestResponse {
		const document = new DOMParser().parseFromString(response.text(), 'application/xml');
		const root = document.documentElement;
		if (root?.localName !== 'ListBucketResult' || document.querySelector('parsererror'))
			throw new Error('Invalid S3 rclone listing.');
		const create = (name: string) =>
			document.createElementNS(
				root.namespaceURI ?? '',
				root.prefix ? `${root.prefix}:${name}` : name,
			);
		const query = new URL(url);
		const scope = query.searchParams.get('prefix') ?? '';
		const continuation = query.searchParams.get('continuation-token');
		query.searchParams.delete('continuation-token');
		query.searchParams.sort();
		const pageKey = query.href;
		let state = this.pages.get(pageKey);
		if (!continuation || !state) {
			state = { keys: new Set(), tokens: new Set() };
			this.pages.set(pageKey, state);
		}
		const flags = children(root, 'IsTruncated');
		const flag = flags[0]?.textContent?.trim();
		if (flags.length > 1 || (flags.length && !['true', 'false', '1', '0'].includes(flag ?? '')))
			throw new Error('Invalid S3 rclone listing pagination.');
		const truncated = flag === 'true' || flag === '1';
		// The backend consumes these fields as strings; use the same values we validate.
		if (flags[0]) flags[0].textContent = String(truncated);
		if (truncated) {
			const tokens = children(root, 'NextContinuationToken');
			const token = tokens[0]?.textContent?.trim();
			if (tokens.length !== 1 || !token || state.tokens.has(token) || token === continuation)
				throw new Error('Incomplete S3 rclone listing pagination.');
			tokens[0].textContent = token;
			state.tokens.add(token);
		}
		const folders = new Set<string>();
		const inferFolders = !scope || scope.endsWith('/');
		for (const object of children(root, 'Contents')) {
			const key = text(object, 'Key');
			if (!key) throw new Error('Missing S3 rclone object key.');
			if (!key.startsWith(scope)) throw new Error(`Out-of-scope S3 rclone object: ${key}`);
			if (inferFolders) addParents(key, scope, folders);
			if (!key.endsWith('/')) {
				const { mtime, size } = objectInfo(
					key,
					text(object, 'LastModified'),
					text(object, 'Size'),
				);
				const uid = objectUid(text(object, 'ETag'), mtime, size);
				let etag = children(object, 'ETag')[0];
				if (!etag) {
					etag = create('ETag');
					object.append(etag);
				}
				etag.textContent = uid;
			}
			if (state.keys.has(key)) object.remove();
			else state.keys.add(key);
		}
		if (inferFolders)
			for (const common of children(root, 'CommonPrefixes')) {
				const prefix = text(common, 'Prefix');
				if (!prefix) continue;
				const folder = prefix.endsWith('/') ? prefix : `${prefix}/`;
				if (!folder.startsWith(scope))
					throw new Error(`Out-of-scope S3 rclone directory: ${folder}`);
				addParents(folder, scope, folders);
			}
		for (const folder of folders) {
			if (folder === scope || state.keys.has(folder)) continue;
			state.keys.add(folder);
			const object = create('Contents');
			const key = create('Key');
			key.textContent = folder;
			object.append(key);
			root.append(object);
		}
		if (!truncated) this.pages.delete(pageKey);
		const normalized = new XMLSerializer().serializeToString(document);
		return { ...response, text: () => normalized };
	}
}
