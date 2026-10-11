import type { RecordStatsMap } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import { createRemote, decide, escape, object, xml } from './s3-harness';

const { request } = testKit;
const scope = 'vault/';
const placeholder = (key: string) =>
	object(`${scope}${key}ThisIsAnEmptyFolderInTheS3Bucket`, { size: 0 });

test('explicit empty directories and real deletions remain detectable', async () => {
	let contents = `${object('vault/keep/note.md')}<Contents><Key>vault/empty/</Key></Contents>`;
	const http = request(() => ({ text: () => xml(contents) }));
	const remote = await createRemote(http.request, scope);
	const before = await remote.fs.list('/', () => 'advance');
	expect(before.find(({ key }) => key === 'empty/')).toMatchObject({ isDir: true });
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
	expect(stats.find(({ key }) => key === 'shared/empty/')).toMatchObject({ isDir: true });
	expect(stats).toHaveLength(5);
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
	const objectKey = 'vault/中文 & space/deep/note #%.md';
	const modified = '2026-10-04T11:00:00.080Z';
	const http = request(() => ({
		text: () =>
			xml(object(objectKey, { mtime: modified }) + placeholder('中文 & space/empty/')),
	}));
	const remote = await createRemote(http.request, scope);
	const stats = await remote.fs.list('/', () => 'advance');
	expect(stats.find(({ key }) => key === '中文 & space/')).toMatchObject({ isDir: true });
	expect(stats.find(({ key }) => key === '中文 & space/deep/')).toMatchObject({ isDir: true });
	expect(stats.find(({ key }) => key === '中文 & space/empty/')).toMatchObject({ isDir: true });
	expect(stats.find((stat) => stat.key.endsWith('.md'))).toMatchObject({
		mtime: Date.parse(modified),
		uid: `${Math.floor(Date.parse(modified) / 1000) * 1000}~22`,
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
	).toMatchObject({ message: 'Incomplete S3 rclone listing pagination.' });
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

test('a zero-byte file named like the placeholder remains a normal file', async () => {
	const size = 0;
	const http = request(() => ({
		text: () => xml(object('vault/ThisIsAnEmptyFolderInTheS3Bucket', { size })),
	}));
	const remote = await createRemote(http.request, scope);
	expect(await remote.fs.list('/', () => 'advance')).toMatchObject([
		{ isDir: false, key: 'ThisIsAnEmptyFolderInTheS3Bucket', size },
	]);
});

test('prefixed XML namespaces retain files and inferred folders', async () => {
	const http = request(() => ({
		text: () =>
			'<s3:ListBucketResult xmlns:s3="http://s3.amazonaws.com/doc/2006-03-01/"><s3:Contents><s3:Key>vault/nested/a.md</s3:Key><s3:LastModified>2026-10-04T11:00:00.080Z</s3:LastModified><s3:ETag/><s3:Size>22</s3:Size></s3:Contents></s3:ListBucketResult>',
	}));
	const remote = await createRemote(http.request, scope);
	const stats = await remote.fs.list('/', () => 'advance');
	expect(stats.find(({ key }) => key === 'nested/')).toMatchObject({ isDir: true });
	expect(stats.find(({ key }) => key === 'nested/a.md')).toMatchObject({
		isDir: false,
		size: 22,
	});
	expect(http.calls).toHaveLength(1);
});

test('repeated files are deduplicated across pages and invalid later stats reject the traversal', async () => {
	const make = (last: string) =>
		request((url) => ({
			text: () =>
				new URL(url).searchParams.has('continuation-token')
					? xml(last)
					: xml(
							object('vault/a.md'),
							'<IsTruncated>true</IsTruncated><NextContinuationToken>next</NextContinuationToken>',
						),
		}));
	const valid = await createRemote(
		make(object('vault/a.md') + object('vault/b.md')).request,
		scope,
	);
	expect((await valid.fs.list('/', () => 'advance')).map(({ key }) => key)).toEqual([
		'a.md',
		'b.md',
	]);
	const invalid = await createRemote(
		make(
			'<Contents><Key>vault/b.md</Key><LastModified>invalid</LastModified><Size>1</Size></Contents>',
		).request,
		scope,
	);
	expect(invalid.fs.list('/', () => 'advance')).rejects.toThrow(
		'Invalid S3 rclone file metadata',
	);
});

test.each([' true ', '\ntrue\n', '1'])(
	'pagination fields normalize before recursive and exact queries (%s)',
	async (flag) => {
		const http = request((url) => {
			const query = new URL(url).searchParams;
			const lookup = query.get('prefix') === `${scope}a.md`;
			const token = query.get('continuation-token');
			if (token && token !== 'next') throw new Error('Unnormalized continuation token');
			return {
				text: () =>
					token
						? xml(
								object(`${scope}${lookup ? 'a' : 'b'}.md`),
								'<IsTruncated> false </IsTruncated>',
							)
						: xml(
								object(`${scope}a.md${lookup ? '.backup' : ''}`),
								`<IsTruncated>${flag}</IsTruncated><NextContinuationToken> next \n</NextContinuationToken>`,
							),
			};
		});
		const remote = await createRemote(http.request, scope);
		expect((await remote.fs.list('/', () => 'advance')).map(({ key }) => key)).toEqual([
			'a.md',
			'b.md',
		]);
		expect(await remote.fs.stat('a.md')).toMatchObject({ key: 'a.md', size: 22 });
		expect(http.calls).toHaveLength(4);
	},
);

test.each(['', 'TRUE', 'unexpected', 'true</IsTruncated><IsTruncated>false'])(
	'invalid pagination flags abort discovery (%s)',
	async (flag) => {
		const http = request(() => ({
			text: () =>
				xml(
					object('a.md'),
					`<IsTruncated>${flag}</IsTruncated><NextContinuationToken>next</NextContinuationToken>`,
				),
		}));
		const remote = await createRemote(http.request);
		expect(remote.fs.list('/', () => 'advance')).rejects.toThrow(
			'Invalid S3 rclone listing pagination.',
		);
		expect(http.calls).toHaveLength(1);
	},
);
