import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import { metadataTime } from '../src/times';
import { createRemote, decide, object, xml } from './s3-harness';
import createVault from './vault';

const standardMtime = Date.parse('2026-10-04T11:00:00.080Z');
const metadataMtime = 1_700_000_123_456;
const ctime = 1_500_000_000_000;
const { bytes, request } = testKit;

test.each([
	{ expected: metadataMtime, unit: 'seconds', value: '1700000123.456' },
	{ expected: metadataMtime, unit: 'milliseconds', value: '1700000123456' },
	{ expected: 1001, unit: 'seconds', value: '1.001' },
	{ expected: 0, unit: 'seconds', value: '0' },
	{ expected: metadataMtime, unit: 'seconds', value: '2023-11-14T22:15:23.456Z' },
	{ expected: metadataMtime, unit: 'milliseconds', value: '2023-11-15T06:15:23.456+08:00' },
	{ expected: undefined, unit: 'seconds', value: undefined },
	{ expected: undefined, unit: 'milliseconds', value: '9000000000000000' },
	{ expected: undefined, unit: 'milliseconds', value: '2023-11-14T22:15:23.456' },
	{ expected: undefined, unit: 'milliseconds', value: '2023-02-30T22:15:23.456Z' },
] as const)(
	'metadata time parses explicit units and zoned ISO timestamps ($value, $unit)',
	({ value, unit, expected }) => {
		expect(metadataTime(value, unit)).toBe(expected);
	},
);

test.each([
	{ expected: standardMtime, prefer: false, streamed: false, value: '1700000123.456' },
	{ expected: metadataMtime, prefer: true, streamed: true, value: '1700000123.456' },
	{ expected: standardMtime, prefer: true, streamed: false, value: undefined },
	{ expected: standardMtime, prefer: true, streamed: true, value: 'invalid' },
])(
	'S3 download restores time without changing discovery ($value, prefer: $prefer, streamed: $streamed)',
	async ({ value, prefer, streamed, expected }) => {
		const body = bytes('body');
		const http = request((url) =>
			new URL(url).searchParams.has('list-type')
				? { text: () => xml(object('a.md', { size: body.length })) }
				: {
						bytes: () => body,
						headers: {
							'x-amz-meta-ctime': String(ctime),
							'x-amz-meta-custom': 'retained',
							...(value === undefined ? {} : { 'x-amz-meta-mtime': value }),
						},
					},
		);
		const remote = await createRemote(http.request, '', false, prefer);
		const [stat] = await remote.fs.list('/', () => 'advance');
		if (stat.isDir) throw new Error('Expected file');
		const originalUid = stat.uid;
		const vault = await createVault();
		const uid = await (streamed
			? vault.fs.writeStream('a.md', await remote.fs.readStream('a.md', stat), stat)
			: vault.fs.write('a.md', await remote.fs.read('a.md', stat), stat));
		expect(vault.files.get('a.md')).toEqual({ ctime, mtime: expected, value: body });
		expect(await stat.meta()).toEqual({
			ctime: String(ctime),
			custom: 'retained',
			mtime: String(expected),
		});
		expect(stat).toMatchObject({ mtime: standardMtime, uid: originalUid });
		const local = await vault.fs.stat('a.md');
		expect(
			await decide(
				[local],
				[stat],
				new Map([['a.md', { isDir: false, local: uid, remote: originalUid }]]),
			),
		).toEqual([]);
		expect(http.calls.map(({ method }) => method)).toEqual(['GET', 'GET']);
	},
);
