import type {
	BaseTask,
	DeciderInput,
	Fs,
	RecordStatsMap,
	Request,
	Stat,
} from '@hesprs/sync-engine-sdk';
import { prefixWrapper } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import MetadataRemoteFs, { RemoteSession, remoteMiddleware } from '../src/remote';
import { getTarget } from '../src/target';

const configuredTarget = getTarget({
	modules: { s3: { bucket: 'vault', endpoint: 'https://s3.example', urlStyle: 'path' } },
	remoteFs: 's3',
});
if (!configuredTarget) throw new Error('Missing target');
export const target = configuredTarget;

export function escape(value: string) {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export const xml = (contents: string, extra = '') =>
	`<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${contents}${extra}</ListBucketResult>`;

export function object(
	key: string,
	{ mtime = '2026-10-04T11:00:00.080Z', size = 22, etag = '' } = {},
) {
	return `<Contents><Key>${escape(key)}</Key><LastModified>${mtime}</LastModified><ETag>${escape(etag)}</ETag><Size>${size}</Size></Contents>`;
}

export async function createRemote(request: Request, prefix = '') {
	const source = new URL('../../s3/src/s3/fs.ts', import.meta.url).href;
	const { default: S3Fs } = (await import(source)) as {
		default: new (options: Record<string, unknown>) => Fs;
	};
	const session = new RemoteSession(target, () => true);
	const raw = new S3Fs({
		accessKeyId: 'key',
		bucket: 'vault',
		endpoint: 'https://s3.example',
		region: 'us-east-1',
		request: remoteMiddleware(request, session),
		urlStyle: 'path',
	});
	const wrapped = new MetadataRemoteFs(raw, session);
	return { fs: prefix ? prefixWrapper(wrapped, prefix) : wrapped, raw, session };
}

export async function decide(local: Array<Stat>, remote: Array<Stat>, records: RecordStatsMap) {
	const source = new URL('../../plugin/src/sync/decision/bidirectional.ts', import.meta.url).href;
	const { default: decider } = (await import(source)) as {
		default: (input: DeciderInput, logger: (message: string) => void) => Array<BaseTask>;
	};
	return testKit.runDecider((input) => decider(input, () => {}), {
		localStats: new Map(local.map((stat) => [stat.key, stat])),
		records,
		remoteStats: new Map(remote.map((stat) => [stat.key, stat])),
	});
}
