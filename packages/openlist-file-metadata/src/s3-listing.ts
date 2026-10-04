import type { RequestResponse } from '@hesprs/sync-engine-sdk';
import normalizeEtag from '@repo/shared/normalize-etag';

type PageState = { folders: Set<string>; tokens: Set<string> };

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
			throw new Error('Invalid OpenList S3 listing.');
		const query = new URL(url);
		const scope = query.searchParams.get('prefix') ?? '';
		const continuation = query.searchParams.get('continuation-token');
		query.searchParams.delete('continuation-token');
		query.searchParams.sort();
		const pageKey = query.href;
		let state = this.pages.get(pageKey);
		if (!continuation || !state) {
			state = { folders: new Set(), tokens: new Set() };
			this.pages.set(pageKey, state);
		}
		const truncated = text(root, 'IsTruncated')?.trim() === 'true';
		if (truncated) {
			const token = text(root, 'NextContinuationToken')?.trim();
			if (!token || state.tokens.has(token) || token === continuation)
				throw new Error('Incomplete OpenList S3 listing pagination.');
			state.tokens.add(token);
		}
		const folders = new Set<string>();
		const inferFolders = !scope || scope.endsWith('/');
		for (const object of children(root, 'Contents')) {
			const key = text(object, 'Key');
			if (!key) continue;
			if (!key.startsWith(scope)) throw new Error(`Out-of-scope OpenList S3 object: ${key}`);
			if (inferFolders) addParents(key, scope, folders);
			if (key.endsWith('/'))
				if (state.folders.has(key)) object.remove();
				else state.folders.add(key);

			// Collect parents before discarding OpenList's virtual empty-folder file.
			if (
				key.split('/').at(-1) === 'ThisIsAnEmptyFolderInTheS3Bucket' &&
				text(object, 'Size') === '0'
			) {
				object.remove();
				continue;
			}
			for (const etag of children(object, 'ETag'))
				if (!normalizeEtag(etag.textContent ?? '')) etag.remove();
		}
		if (inferFolders)
			for (const common of children(root, 'CommonPrefixes')) {
				const prefix = text(common, 'Prefix');
				if (!prefix) continue;
				const folder = prefix.endsWith('/') ? prefix : `${prefix}/`;
				if (!folder.startsWith(scope))
					throw new Error(`Out-of-scope OpenList S3 directory: ${folder}`);
				addParents(folder, scope, folders);
			}
		for (const folder of folders) {
			if (folder === scope || state.folders.has(folder)) continue;
			state.folders.add(folder);
			const prefix = root.prefix ? `${root.prefix}:` : '';
			const object = document.createElementNS(root.namespaceURI ?? '', `${prefix}Contents`);
			const key = document.createElementNS(root.namespaceURI ?? '', `${prefix}Key`);
			key.textContent = folder;
			object.append(key);
			root.append(object);
		}
		if (!truncated) this.pages.delete(pageKey);
		const normalized = new XMLSerializer().serializeToString(document);
		return { ...response, text: () => normalized };
	}
}
