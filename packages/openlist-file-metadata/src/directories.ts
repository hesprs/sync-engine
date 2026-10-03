import type { Request, RequestResponse } from '@hesprs/sync-engine-sdk';
import parseXML from '@repo/shared/parse-xml';
import type { Target } from './target';

type Listing = {
	CommonPrefixes?: { Prefix?: string } | Array<{ Prefix?: string }>;
	Contents?: { Key?: string } | Array<{ Key?: string }>;
	IsTruncated?: string;
	NextContinuationToken?: string;
};

function array<T>(value?: T | Array<T>): Array<T> {
	return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function readListing(response: RequestResponse): Listing {
	const parsed = parseXML<{ ListBucketResult?: Listing }>(response.text());
	if (!parsed.ListBucketResult) throw new Error('Invalid OpenList S3 directory listing.');
	return parsed.ListBucketResult;
}

function addParents(key: string, scope: string, folders: Set<string>) {
	for (
		let slash = key.indexOf('/', scope.length);
		slash !== -1;
		slash = key.indexOf('/', slash + 1)
	)
		folders.add(key.slice(0, slash + 1));
}

function escapeXml(value: string) {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export default class S3DirectoryListing {
	private readonly snapshots = new Map<string, Promise<Set<string>>>();
	private readonly emitted = new Map<string, Set<string>>();

	clear() {
		this.snapshots.clear();
		this.emitted.clear();
	}

	async restore(response: RequestResponse, url: string, request: Request, target: Target) {
		const parsed = new URL(url);
		const scope = parsed.searchParams.get('prefix') ?? '';
		if (scope && !scope.endsWith('/')) return response;
		const listing = readListing(response);
		if (listing.IsTruncated === 'true' && !listing.NextContinuationToken)
			throw new Error('Incomplete OpenList S3 directory listing pagination.');
		let snapshot = this.snapshots.get(scope);
		if (!snapshot) {
			snapshot = S3DirectoryListing.discover(scope, request, target);
			this.snapshots.set(scope, snapshot);
		}
		const folders = new Set(await snapshot);
		let emitted = this.emitted.get(scope);
		if (!emitted) {
			emitted = new Set();
			this.emitted.set(scope, emitted);
		}
		for (const { Key } of array(listing.Contents)) {
			if (!Key?.startsWith(scope)) continue;
			addParents(Key, scope, folders);
			if (Key.endsWith('/')) emitted.add(Key);
		}
		for (const { Prefix } of array(listing.CommonPrefixes)) {
			if (!Prefix) continue;
			const folder = Prefix.endsWith('/') ? Prefix : `${Prefix}/`;
			if (folder.startsWith(scope) && folder !== scope) folders.add(folder);
		}
		const additions: Array<string> = [];
		for (const folder of folders) {
			if (folder === scope || emitted.has(folder)) continue;
			emitted.add(folder);
			// Feed the existing backend parser its usual folder-marker shape.
			additions.push(`<Contents><Key>${escapeXml(folder)}</Key></Contents>`);
		}
		const text = response
			.text()
			.replace(/<\/(?:[\w-]+:)?ListBucketResult>/u, `${additions.join('')}$&`);
		return { ...response, text: () => text };
	}

	private static async discover(
		scope: string,
		request: Request,
		target: Target,
	): Promise<Set<string>> {
		const folders = new Set<string>();
		const visited = new Set<string>([scope]);
		const pending = [scope];
		while (pending.length) {
			const batch = pending.splice(0, 8);
			const results = await Promise.all(
				batch.map((prefix) => S3DirectoryListing.children(prefix, request, target)),
			);
			for (const children of results)
				for (const folder of children) {
					folders.add(folder);
					addParents(folder, scope, folders);
					if (!visited.has(folder)) {
						visited.add(folder);
						pending.push(folder);
					}
				}
		}
		return folders;
	}

	private static async children(prefix: string, request: Request, target: Target) {
		const folders = new Set<string>();
		const tokens = new Set<string>();
		let token: string | undefined;
		do {
			const url = new URL(target.url('/'));
			url.searchParams.set('list-type', '2');
			url.searchParams.set('delimiter', '/');
			url.searchParams.set('prefix', prefix);
			if (token) url.searchParams.set('continuation-token', token);
			const response = await request(url.toString(), { method: 'GET', throw: false });
			if (response.status < 200 || response.status >= 300)
				throw Object.assign(
					new Error(
						`OpenList S3 directory listing failed: HTTP ${response.status} ${url}`,
					),
					{ status: response.status },
				);
			const listing = readListing(response);
			for (const { Prefix } of array(listing.CommonPrefixes)) {
				if (!Prefix) continue;
				const folder = Prefix.endsWith('/') ? Prefix : `${Prefix}/`;
				if (!folder.startsWith(prefix) || folder === prefix)
					throw new Error(`Out-of-scope OpenList S3 directory: ${folder}`);
				folders.add(folder);
			}
			for (const { Key } of array(listing.Contents)) {
				if (!Key?.startsWith(prefix)) continue;
				addParents(Key, prefix, folders);
			}
			if (listing.IsTruncated !== 'true') break;
			token = listing.NextContinuationToken;
			if (!token || tokens.has(token))
				throw new Error('Incomplete OpenList S3 directory listing pagination.');
			tokens.add(token);
		} while (token);
		return folders;
	}
}
