import { md5 } from 'hash-wasm';
import type { WebdavDB } from '@';
import type { Request, RequestResponse, StringKV } from '@hesprs/sync-engine-sdk';

type DigestChallenge = {
	algorithm?: string;
	nonce: string;
	opaque?: string;
	// Normalized to 'auth' when the server offers it, or omitted for legacy challenges without qop.
	qop?: 'auth';
	realm: string;
};

export type DigestInfo = DigestChallenge & {
	// MD5(username:realm:password) cached at challenge-parse time, so requests only hash HA2 and the response.
	ha1: string;
	// RFC 7616 nonce count, formatted as 8 lowercase hex digits per request.
	nc: number;
};

export default function authorizationMiddleware(
	request: Request,
	{ username, password, endpoint }: { username: string; password: string; endpoint: string },
	db: WebdavDB,
): Request {
	const authMarker = `${endpoint}~${username}~${password}`;
	const basic = `Basic ${btoa(`${username}:${password}`)}`;
	const loadDigest = (): DigestInfo | undefined =>
		db.getMeta('authMarker') === authMarker ? db.getMeta('digest') : undefined;
	return async (url, params) => {
		const send = async (): Promise<RequestResponse> => {
			const digest = loadDigest();
			if (digest) digest.nc += 1;
			// The spread freezes the drawn count: the stored entry keeps mutating in place, and a
			// concurrent request starting during the md5 awaits below must not shift this one's count.
			const snapshot = digest && { ...digest };
			return request(url, {
				...params,
				headers: {
					...params?.headers,
					Authorization: snapshot
						? await digestAuthorization(
								snapshot,
								username,
								params?.method ?? 'GET',
								url,
							)
						: basic,
				},
			});
		};
		const response = await send();
		const header = response.headers['www-authenticate'];
		if (response.status !== 401 || !header) return response;
		const challenge = parseDigestChallenge(header);
		if (!challenge) return response;
		db.setMeta('authMarker', authMarker);
		db.setMeta('digest', {
			...challenge,
			ha1: await md5(`${username}:${challenge.realm}:${password}`),
			nc: 0,
		});
		return send();
	};
}

async function digestAuthorization(
	digest: DigestInfo,
	username: string,
	method: string,
	url: string,
): Promise<string> {
	const { pathname, search } = new URL(url);
	const uri = `${pathname}${search}`;
	const ha2 = await md5(`${method}:${uri}`);
	const directives = [
		`username="${quote(username)}"`,
		`realm="${quote(digest.realm)}"`,
		`nonce="${quote(digest.nonce)}"`,
		`uri="${uri}"`,
	];
	let hash: string;
	if (digest.qop) {
		const nc = digest.nc.toString(16).padStart(8, '0');
		const cnonce = crypto.randomUUID();
		hash = await md5(`${digest.ha1}:${digest.nonce}:${nc}:${cnonce}:${digest.qop}:${ha2}`);
		directives.push(`qop=${digest.qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
	} else hash = await md5(`${digest.ha1}:${digest.nonce}:${ha2}`);
	directives.push(`response="${hash}"`);
	if (digest.opaque) directives.push(`opaque="${quote(digest.opaque)}"`);
	if (digest.algorithm) directives.push(`algorithm=${digest.algorithm}`);
	return `Digest ${directives.join(', ')}`;
}

function quote(value: string) {
	return value.replaceAll(/["\\]/gu, String.raw`\$&`);
}

function parseDigestChallenge(header: string): DigestChallenge | undefined {
	const params: StringKV = {};
	let inDigest = false;
	for (const segment of splitUnquoted(header)) {
		const trimmed = segment.trim();
		const param = parseParam(trimmed);
		if (param) {
			if (inDigest) params[param.name] = param.value;
			continue;
		}
		const scheme = /^(?<scheme>[A-Za-z]+)(?:\s+(?<rest>.+))?$/u.exec(trimmed);
		if (!scheme) continue;
		inDigest = scheme.groups?.scheme?.toLowerCase() === 'digest';
		if (!inDigest) continue;
		// The first parameter shares the scheme's segment, as in `Digest realm="x", nonce="y"`.
		const first = scheme.groups?.rest ? parseParam(scheme.groups.rest.trim()) : undefined;
		if (first) params[first.name] = first.value;
	}
	if (!inDigest || !params.nonce || !params.realm) return;
	if (params.algorithm && params.algorithm.toLowerCase() !== 'md5') return;
	const options = params.qop?.split(',').map((option) => option.trim());
	if (options && !options.includes('auth')) return;
	return {
		algorithm: params.algorithm,
		nonce: params.nonce,
		opaque: params.opaque,
		qop: options ? 'auth' : undefined,
		realm: params.realm,
	};
}

function parseParam(input: string): { name: string; value: string } | undefined {
	const match = /^(?<name>[\w~-]+)=(?<value>.*)$/u.exec(input);
	if (!match) return;
	const { name = '', value = '' } = match.groups ?? {};
	return { name: name.toLowerCase(), value: unquote(value.trim()) };
}

function unquote(value: string) {
	if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value;
	return value.slice(1, -1).replaceAll(/\\(?<char>.)/gu, '$<char>');
}

// Splits on commas outside quoted strings, so values like qop="auth,auth-int" stay whole.
// Each match is a run of bare characters or complete quoted strings; commas fall between runs.
function splitUnquoted(header: string): Array<string> {
	return header.match(/(?:[^",]|"(?:[^"\\]|\\.)*")+/gu) ?? [];
}
