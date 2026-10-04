import type { RecordStatsMap } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import { createRemote, decide, escape, object, xml } from './s3-harness';

const { request, folder } = testKit;
const scope = 'vault/';
const placeholder = (key: string) =>
	object(`${scope}${key}ThisIsAnEmptyFolderInTheS3Bucket`, { size: 0 });

test('222 OpenList objects recover 220 files and 31 directories with one list request', async () => {
	const files = Array.from({ length: 220 }, (_, i) => `${scope}dir-${i % 29}/note-${i}.md`);
	const http = request(() => ({
		text: () =>
			xml(
				files.map((key) => object(key)).join('') +
					placeholder('empty-a/') +
					placeholder('empty-b/'),
			),
	}));
	const remote = await createRemote(http.request, scope);
	const stats = await remote.fs.list('/', () => 'advance');
	expect(stats.filter((stat) => !stat.isDir)).toHaveLength(220);
	expect(stats.filter((stat) => stat.isDir)).toHaveLength(31);
	expect(stats).toContainEqual(folder('empty-a/'));
	expect(stats).toContainEqual(folder('empty-b/'));
	expect(stats.some(({ key }) => key.includes('ThisIsAnEmptyFolderInTheS3Bucket'))).toBe(false);
	expect(http.calls).toHaveLength(1);
	expect(http.calls[0].method).toBe('GET');
	expect(new URL(http.calls[0].url).searchParams.has('delimiter')).toBe(false);
	const local = stats.map((stat) =>
		stat.isDir ? { ...stat } : { ...stat, uid: `local-${stat.uid}` },
	);
	const records: RecordStatsMap = new Map(
		stats.map((stat) => [
			stat.key,
			stat.isDir
				? { isDir: true }
				: { isDir: false, local: `local-${stat.uid}`, remote: stat.uid },
		]),
	);
	expect(await decide(local, stats, records)).toEqual([]);
	expect(await remote.fs.list('/', () => 'advance')).toEqual(stats);
	expect(http.calls).toHaveLength(2);
});

test('empty-directory placeholders survive filtering and real deletions remain detectable', async () => {
	let contents = object('vault/keep/note.md') + placeholder('empty/');
	const http = request(() => ({ text: () => xml(contents) }));
	const remote = await createRemote(http.request, scope);
	const before = await remote.fs.list('/', () => 'advance');
	expect(before).toContainEqual(folder('empty/'));
	const local = before.map((stat) =>
		stat.isDir ? { ...stat } : { ...stat, uid: `local-${stat.uid}` },
	);
	const records: RecordStatsMap = new Map(
		before.map((stat) => [
			stat.key,
			stat.isDir
				? { isDir: true }
				: { isDir: false, local: `local-${stat.uid}`, remote: stat.uid },
		]),
	);
	contents = object('vault/keep/note.md');
	const removed = await remote.fs.list('/', () => 'advance');
	expect((await decide(local, removed, records)).map(({ key, name }) => ({ key, name }))).toEqual(
		[{ key: 'empty/', name: 'removeLocal' }],
	);
	expect(
		await remote.fs.list('/', ({ current }) =>
			current.startsWith('keep/') ? 'exclude' : 'advance',
		),
	).toEqual([]);
});

test('pagination deduplicates inferred and explicit folders across pages', async () => {
	const http = request((url) => ({
		text: () =>
			new URL(url).searchParams.has('continuation-token')
				? xml(
						`<Contents><Key>vault/shared/</Key></Contents>${object('vault/shared/b.md')}${placeholder('shared/empty/')}`,
					)
				: xml(
						object('vault/shared/a.md'),
						'<IsTruncated>true</IsTruncated><NextContinuationToken>next</NextContinuationToken>',
					),
	}));
	const remote = await createRemote(http.request, scope);
	const stats = await remote.fs.list('/', () => 'advance');
	expect(stats.filter(({ key }) => key === 'shared/')).toHaveLength(1);
	expect(stats).toContainEqual(folder('shared/empty/'));
	expect(stats).toHaveLength(4);
	expect(http.calls).toHaveLength(2);
	expect(
		http.calls.every(
			({ method, url }) => method === 'GET' && !new URL(url).searchParams.has('delimiter'),
		),
	).toBe(true);
});

test('delimited responses normalize CommonPrefixes from the returned XML alone', async () => {
	const http = request(() => ({
		text: () =>
			xml(
				`<CommonPrefixes><Prefix>${escape('vault/中文 & space')}</Prefix></CommonPrefixes><CommonPrefixes><Prefix>vault/empty/</Prefix></CommonPrefixes>`,
			),
	}));
	const remote = await createRemote(http.request);
	const { remoteMiddleware } = await import('../src/remote');
	const send = remoteMiddleware(http.request, remote.session);
	const listing = await send(
		'https://s3.example/vault/?list-type=2&prefix=vault%2F&delimiter=%2F',
	);
	expect(listing.text()).toContain('vault/中文 &amp; space/');
	expect(listing.text()).toContain('<Key>vault/empty/</Key>');
	expect(http.calls).toHaveLength(1);
});

test('nested Unicode keys and empty folders are inferred without touching file dates', async () => {
	const key = 'vault/中文 & space/deep/note #%.md';
	const modified = '2026-10-04T11:00:00.080Z';
	const http = request(() => ({
		text: () => xml(object(key, { mtime: modified }) + placeholder('中文 & space/empty/')),
	}));
	const remote = await createRemote(http.request, scope);
	const stats = await remote.fs.list('/', () => 'advance');
	expect(stats).toContainEqual(folder('中文 & space/'));
	expect(stats).toContainEqual(folder('中文 & space/deep/'));
	expect(stats).toContainEqual(folder('中文 & space/empty/'));
	expect(stats.find((stat) => stat.key.endsWith('.md'))).toMatchObject({
		mtime: Date.parse(modified),
		uid: `${Date.parse(modified)}~22`,
	});
	expect(http.calls).toHaveLength(1);
});

test.each(['missing', 'repeated'])('incomplete %s pagination rejects discovery', async (mode) => {
	const http = request(() => ({
		text: () =>
			xml(
				object('vault/a.md'),
				`<IsTruncated>true</IsTruncated>${mode === 'repeated' ? '<NextContinuationToken>same</NextContinuationToken>' : ''}`,
			),
	}));
	const remote = await createRemote(http.request, scope);
	expect(
		await Promise.resolve(remote.fs.list('/', () => 'advance')).catch(
			(error: unknown) => error,
		),
	).toMatchObject({ message: 'Incomplete OpenList S3 listing pagination.' });
	expect(http.calls).toHaveLength(mode === 'missing' ? 1 : 2);
});

test('a failed later page cannot become a partial remote list', async () => {
	const http = request((url) =>
		new URL(url).searchParams.has('continuation-token')
			? { status: 403, text: () => '<Error><Code>AccessDenied</Code></Error>' }
			: {
					text: () =>
						xml(
							object('vault/a.md'),
							'<IsTruncated>true</IsTruncated><NextContinuationToken>next</NextContinuationToken>',
						),
				},
	);
	const remote = await createRemote(http.request, scope);
	expect(
		await Promise.resolve(remote.fs.list('/', () => 'advance')).catch(
			(error: unknown) => error,
		),
	).toMatchObject({ status: 403 });
	expect(http.calls).toHaveLength(2);
});

test('out-of-scope objects and invalid listing roots reject discovery', async () => {
	for (const body of [xml(object('other/a.md')), '<Unexpected/>']) {
		const http = request(() => ({ text: () => body }));
		const remote = await createRemote(http.request, scope);
		expect(
			await Promise.resolve(remote.fs.list('/', () => 'advance')).catch(
				(error: unknown) => error,
			),
		).toBeInstanceOf(Error);
		expect(http.calls).toHaveLength(1);
	}
});

test('a nonempty file named like the placeholder remains a normal file', async () => {
	const http = request(() => ({
		text: () => xml(object('vault/ThisIsAnEmptyFolderInTheS3Bucket', { size: 1 })),
	}));
	const remote = await createRemote(http.request, scope);
	expect(await remote.fs.list('/', () => 'advance')).toMatchObject([
		{ isDir: false, key: 'ThisIsAnEmptyFolderInTheS3Bucket', size: 1 },
	]);
});

test('prefixed XML namespaces retain files and inferred folders', async () => {
	const http = request(() => ({
		text: () =>
			'<s3:ListBucketResult xmlns:s3="http://s3.amazonaws.com/doc/2006-03-01/"><s3:Contents><s3:Key>vault/nested/a.md</s3:Key><s3:LastModified>2026-10-04T11:00:00.080Z</s3:LastModified><s3:ETag/><s3:Size>22</s3:Size></s3:Contents></s3:ListBucketResult>',
	}));
	const remote = await createRemote(http.request, scope);
	const stats = await remote.fs.list('/', () => 'advance');
	expect(stats).toContainEqual(folder('nested/'));
	expect(stats.find(({ key }) => key === 'nested/a.md')).toMatchObject({
		isDir: false,
		size: 22,
	});
	expect(http.calls).toHaveLength(1);
});
