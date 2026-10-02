import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import { customHeadersMiddleware, VaultFs } from '@/fs';

const { request } = testKit;

test('custom headers middleware adds headers to a bare url request', () => {
	const harness = request(() => ({}));
	const wrapped = customHeadersMiddleware(harness.request, { 'x-added': 'value' });

	expect(wrapped('note.md')).resolves.toMatchObject({ status: 200 });
	expect(harness.calls).toStrictEqual([{ headers: { 'x-added': 'value' }, url: 'note.md' }]);
});

test('custom headers middleware merges supplied headers and overrides duplicates', () => {
	const harness = request(() => ({}));
	const wrapped = customHeadersMiddleware(harness.request, {
		'x-added': 'value',
		'x-override': 'new',
	});

	expect(
		wrapped('note.md', {
			headers: {
				'x-keep': 'keep',
				'x-override': 'old',
			},
		}),
	).resolves.toMatchObject({ status: 200 });
	expect(harness.calls).toStrictEqual([
		{
			headers: {
				'x-added': 'value',
				'x-keep': 'keep',
				'x-override': 'new',
			},
			url: 'note.md',
		},
	]);
});

test('file placeholders preserve vault creation time and convert timestamp units exactly', async () => {
	const vault = new VaultFs(
		() =>
			Promise.resolve({
				ctime: 1_700_000_000_456,
				mtime: 1_700_000_000_123,
				size: 0,
				type: 'file',
			} as never),
		'Vault',
	);
	const file = await vault.stat('Notes/empty.md');
	if (file.isDir) throw new Error('Expected a file stat');
	const harness = request(() => ({}));
	const wrapped = customHeadersMiddleware(harness.request, {
		'x-ctime': '{{ctime}}',
		'x-ctime-milliseconds': '{{ctime:ms}}',
		'x-ctime-seconds': '{{ctime:s}}',
		'x-file': '{{key}}:{{size}}:{{uid}}',
		'x-mtime': '{{mtime}}',
		'x-mtime-microseconds': '{{mtime:us}}',
		'x-mtime-milliseconds': '{{mtime:ms}}',
		'x-mtime-nanoseconds': '{{mtime:ns}}',
		'x-mtime-seconds': '{{mtime:s}}',
	});
	const params = { headerVariables: file, method: 'PUT' };
	await wrapped('https://example.com/remote/empty.md', params);
	expect(harness.calls).toStrictEqual([
		{
			headers: {
				'x-ctime': '1700000000.456',
				'x-ctime-milliseconds': '1700000000456',
				'x-ctime-seconds': '1700000000.456',
				'x-file': 'Notes/empty.md:0:1700000000123~0',
				'x-mtime': '1700000000.123',
				'x-mtime-microseconds': '1700000000123000',
				'x-mtime-milliseconds': '1700000000123',
				'x-mtime-nanoseconds': '1700000000123000000',
				'x-mtime-seconds': '1700000000.123',
			},
			method: 'PUT',
			url: 'https://example.com/remote/empty.md',
		},
	]);
});

test('missing file properties omit the whole templated header and preserve static headers', async () => {
	const harness = request(() => ({}));
	const wrapped = customHeadersMiddleware(harness.request, {
		'x-created': 'created={{ctime:s}}',
		'x-modified': '{{mtime}}',
		'x-static': 'keep',
		'x-unknown': '{{unknown}}',
	});
	await wrapped('https://example.com/?list-type=2');
	const params = { headerVariables: testKit.file('epoch.md', { mtime: 0 }), method: 'PUT' };
	await wrapped('https://example.com/epoch.md', params);
	expect(harness.calls.map(({ headers }) => headers)).toStrictEqual([
		{ 'x-static': 'keep' },
		{ 'x-modified': '0', 'x-static': 'keep' },
	]);
});

test('default timestamp placeholders preserve fractional milliseconds as rclone seconds', async () => {
	const harness = request(() => ({}));
	const wrapped = customHeadersMiddleware(harness.request, {
		'x-amz-meta-mtime': '{{mtime}}',
		'x-created': '{{ctime}}',
	});
	await wrapped('note.md', {
		headerVariables: { ctime: 1234.123456, mtime: 1_700_000_000_123.125 },
	});
	expect(harness.calls[0].headers).toStrictEqual({
		'x-amz-meta-mtime': '1700000000.123125',
		'x-created': '1.234123456',
	});
});

test('custom variables support future headers without depending on file properties', async () => {
	const harness = request(() => ({}));
	const wrapped = customHeadersMiddleware(harness.request, {
		'X-Checksum': '{{ checksum.sha256 }}',
		'X-Expires': '{{expires:s}}',
		'X-Literal': String.raw`\{{token}}`,
		'X-Revision': '{{revision}}',
		'X-State': '{{tenant-id}}/{{enabled}}/{{count}}',
	});
	await wrapped('note.md', {
		headerVariables: {
			'checksum.sha256': 'abc123',
			count: 0,
			enabled: false,
			expires: 1_700_000_000_123,
			revision: 9_007_199_254_740_993n,
			'tenant-id': 'team-a',
		},
	});
	expect(harness.calls[0].headers).toStrictEqual({
		'X-Checksum': 'abc123',
		'X-Expires': '1700000000.123',
		'X-Literal': '{{token}}',
		'X-Revision': '9007199254740993',
		'X-State': 'team-a/false/0',
	});
	expect(harness.calls[0]).not.toHaveProperty('headerVariables');
});

test('custom headers override names case-insensitively without mutating request headers', async () => {
	const harness = request(() => ({}));
	const wrapped = customHeadersMiddleware(harness.request, {
		'X-Empty': '',
		'content-type': 'text/plain',
	});
	const headers = { 'Content-Type': 'application/octet-stream', 'X-Keep': 'keep' };
	await wrapped('note.md', { headers });
	expect(harness.calls[0].headers).toStrictEqual({
		'X-Empty': '',
		'X-Keep': 'keep',
		'content-type': 'text/plain',
	});
	expect(headers).toStrictEqual({ 'Content-Type': 'application/octet-stream', 'X-Keep': 'keep' });
});

test.each([
	{ expected: '1700000000123125000', format: 'ns', value: 1_700_000_000_123.125 },
	{ expected: '0.1', format: 'ns', value: 1e-7 },
	{ expected: '-0.0000000001', format: 's', value: -1e-7 },
	{ expected: '1000000000000000000000000', format: 'us', value: 1e21 },
	{ expected: '9007199254740993123000000', format: 'ns', value: 9_007_199_254_740_993_123n },
])(
	'formats $value as $format without float scaling or exponent notation',
	async ({ expected, format, value }) => {
		const harness = request(() => ({}));
		const wrapped = customHeadersMiddleware(harness.request, {
			'X-Time': `{{time:${format}}}`,
		});
		await wrapped('note.md', { headerVariables: { time: value } });
		expect(harness.calls[0].headers).toStrictEqual({ 'X-Time': expected });
	},
);

test('unsupported formats, invalid numbers, and inherited properties omit their headers', async () => {
	const harness = request(() => ({}));
	const wrapped = customHeadersMiddleware(harness.request, {
		'X-Inherited': '{{constructor}}',
		'X-Invalid': '{{invalid}}',
		'X-String-Time': '{{text:s}}',
		'X-Unsupported': '{{time:days}}',
	});
	await wrapped('note.md', {
		headerVariables: { invalid: Number.NaN, text: '1000', time: 1000 },
	});
	expect(harness.calls[0].headers).toStrictEqual({});
});
