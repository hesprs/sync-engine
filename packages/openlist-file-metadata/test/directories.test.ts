import type { BaseTask, DeciderInput, Fs, RecordStatsMap, Stat } from '@hesprs/sync-engine-sdk';
import { prefixWrapper } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import S3DirectoryListing from '../src/directories';
import MetadataRemoteFs, { RemoteSession, remoteMiddleware } from '../src/remote';
import { getTarget } from '../src/target';

const target = getTarget({
	modules: { s3: { bucket: 'bucket', endpoint: 'https://s3.example', urlStyle: 'path' } },
	remoteFs: 's3',
});
if (!target) throw new Error('Missing test target');
const { request, file, folder, runDecider } = testKit;
const scope = 'vault/';
const xml = (contents: string) =>
	`<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${contents}</ListBucketResult>`;
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const prefix = (value: string) =>
	`<CommonPrefixes><Prefix>${escape(value)}</Prefix></CommonPrefixes>`;

async function realBackend(transport: ReturnType<typeof request>['request']) {
	const source = new URL('../../s3/src/s3/fs.ts', import.meta.url).href;
	const { default: S3Fs } = (await import(source)) as {
		default: new (options: Record<string, unknown>) => Fs;
	};
	return new S3Fs({
		accessKeyId: 'key',
		bucket: 'bucket',
		endpoint: 'https://s3.example',
		region: 'us-east-1',
		request: transport,
		urlStyle: 'path',
	});
}

async function decide(local: Array<Stat>, remote: Array<Stat>, records: RecordStatsMap) {
	const source = new URL('../../plugin/src/sync/decision/bidirectional.ts', import.meta.url).href;
	const { default: decider } = (await import(source)) as {
		default: (input: DeciderInput, logger: (message: string) => void) => Array<BaseTask>;
	};
	return runDecider((input) => decider(input, () => {}), {
		localStats: new Map(local.map((stat) => [stat.key, stat])),
		records,
		remoteStats: new Map(remote.map((stat) => [stat.key, stat])),
	});
}

test('217 files and 28 OpenList directories survive a second bidirectional sync including empty folders', async () => {
	const folders = new Set([
		...Array.from({ length: 26 }, (_, i) => `${scope}group-${i}/`),
		`${scope}group-0/empty/`,
		`${scope}group-1/nested/`,
	]);
	const nonempty = [...folders].filter((key) => !key.endsWith('/empty/'));
	const files = new Map(
		Array.from({ length: 217 }, (_, i) => {
			const key = `${nonempty[i % nonempty.length]}note-${i}.md`;
			return [key, file(key, { mtime: 1_704_067_200_000, size: 5, uid: `etag-${i}` })];
		}),
	);
	const http = request((url) => {
		const query = new URL(url).searchParams;
		const root = query.get('prefix') ?? '';
		const delimiter = query.has('delimiter');
		const objects = [...files.values()].filter(
			({ key }) =>
				key.startsWith(root) && (!delimiter || !key.slice(root.length).includes('/')),
		);
		const contents = objects
			.map(
				({ key, uid }) =>
					`<Contents><Key>${key}</Key><ETag>${uid}</ETag><Size>5</Size><LastModified>2024-01-01T00:00:00Z</LastModified></Contents>`,
			)
			.join('');
		const children = delimiter
			? [...folders]
					.filter(
						(key) =>
							key.startsWith(root) &&
							key !== root &&
							!key.slice(root.length, -1).includes('/'),
					)
					.map((key) => prefix(key.slice(0, -1)))
					.join('')
			: '';
		return { text: () => xml(contents + children) };
	});
	const raw = prefixWrapper(await realBackend(http.request), scope);
	const session = new RemoteSession(target, () => true);
	const fixed = prefixWrapper(
		new MetadataRemoteFs(await realBackend(remoteMiddleware(http.request, session)), session),
		scope,
	);
	const before = await raw.list('/', () => 'advance');
	const after = await fixed.list('/', () => 'advance');
	expect(before).toHaveLength(217);
	expect(after).toHaveLength(245);
	expect(after.filter((stat) => stat.isDir)).toHaveLength(28);
	expect(after).toContainEqual(folder('group-0/empty/'));
	const local = after.map((stat) =>
		stat.isDir ? { ...stat } : { ...stat, uid: `local-${stat.uid}` },
	);
	const records: RecordStatsMap = new Map(
		after.map((stat) => [
			stat.key,
			stat.isDir
				? { isDir: true }
				: { isDir: false, local: `local-${stat.uid}`, remote: stat.uid },
		]),
	);
	expect(
		(await decide(local, before, records)).filter(({ name }) => name === 'removeLocal'),
	).toHaveLength(28);
	expect(await decide(local, after, records)).toEqual([]);
	// Reusing the same filesystem must refresh the directory snapshot.
	for (const key of folders) if (key.startsWith(`${scope}group-1/`)) folders.delete(key);
	for (const key of files.keys()) if (key.startsWith(`${scope}group-1/`)) files.delete(key);
	const removed = await fixed.list('/', () => 'advance');
	expect(removed.some(({ key }) => key.startsWith('group-1/'))).toBe(false);
	expect(
		(await decide(local, removed, records)).some(
			({ key, name }) => key === 'group-1/' && name === 'removeLocal',
		),
	).toBe(true);
});

test('directory-only pages, missing trailing slashes and continuation tokens preserve empty directories', async () => {
	const http = request((url) => {
		const query = new URL(url).searchParams;
		if (query.get('prefix') === scope && !query.has('continuation-token'))
			return {
				text: () =>
					xml(
						`${prefix('vault/empty')}<IsTruncated>true</IsTruncated><NextContinuationToken>next</NextContinuationToken>`,
					),
			};
		if (query.get('prefix') === scope)
			return { text: () => xml(prefix('vault/中文 & space/')) };
		return { text: () => xml('') };
	});
	const session = new RemoteSession(target, () => true);
	const fixed = prefixWrapper(
		new MetadataRemoteFs(await realBackend(remoteMiddleware(http.request, session)), session),
		scope,
	);
	const stats = await fixed.list('/', () => 'advance');
	expect(stats).toContainEqual(folder('empty/'));
	expect(stats).toContainEqual(folder('中文 & space/'));
	expect(stats).toHaveLength(2);
	expect(
		http.calls.filter(
			({ url }) => new URL(url).searchParams.get('continuation-token') === 'next',
		),
	).toHaveLength(2);
});

test('inferred directories honor backend reporter filtering and existing markers are not duplicated', async () => {
	const entries =
		'<Contents><Key>vault/keep/</Key></Contents><Contents><Key>vault/keep/note.md</Key><ETag>uid</ETag><Size>1</Size><LastModified>2024-01-01T00:00:00Z</LastModified></Contents>';
	const http = request((url) => ({
		text: () => xml(new URL(url).searchParams.has('delimiter') ? '' : entries),
	}));
	const session = new RemoteSession(target, () => true);
	const fixed = prefixWrapper(
		new MetadataRemoteFs(await realBackend(remoteMiddleware(http.request, session)), session),
		scope,
	);
	expect(
		(await fixed.list('/', () => 'advance')).filter(({ key }) => key === 'keep/'),
	).toHaveLength(1);
	expect(
		await fixed.list('/', ({ current }) =>
			current.startsWith('keep/') ? 'exclude' : 'advance',
		),
	).toEqual([]);
});

test.each(['missing', 'repeated'])(
	'incomplete %s pagination aborts discovery instead of returning a partial folder list',
	async (mode) => {
		const http = request(() => ({
			text: () =>
				xml(
					`${prefix('vault/empty')}<IsTruncated>true</IsTruncated>${
						mode === 'repeated'
							? '<NextContinuationToken>same</NextContinuationToken>'
							: ''
					}`,
				),
		}));
		const restore = new S3DirectoryListing();
		const failure = await restore
			.restore(
				await http.request(target.url('/')),
				`${target.url('/')}?prefix=vault/`,
				http.request,
				target,
			)
			.catch((error: unknown) => error);
		expect(failure).toMatchObject({
			message: 'Incomplete OpenList S3 directory listing pagination.',
		});
	},
);

test('directory access failures abort discovery and cannot become an empty remote list', async () => {
	const http = request(() => ({ status: 403 }));
	const restore = new S3DirectoryListing();
	const initial = testKit.request(() => ({ text: () => xml('') }));
	const failure = await restore
		.restore(
			await initial.request(target.url('/')),
			`${target.url('/')}?prefix=vault/`,
			http.request,
			target,
		)
		.catch((error: unknown) => error);
	expect(failure).toMatchObject({ status: 403 });
});

test('an empty OpenList placeholder is not synced as a real file', async () => {
	const http = request(() => ({
		text: () =>
			xml(
				'<Contents><Key>vault/ThisIsAnEmptyFolderInTheS3Bucket</Key><ETag/><Size>0</Size></Contents>',
			),
	}));
	const session = new RemoteSession(target, () => true);
	const fixed = prefixWrapper(
		new MetadataRemoteFs(await realBackend(remoteMiddleware(http.request, session)), session),
		scope,
	);
	expect(await fixed.list('/', () => 'advance')).toEqual([]);
	expect(http.calls.every(({ method }) => method !== 'HEAD')).toBe(true);
});
