import authorizationMiddleware from '@/webdav/auth';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { beforeEach, expect, test } from 'bun:test';
import { md5 } from 'hash-wasm';
import { openMemoryDB } from 'uni-kv';
import type { DigestInfo } from '@/webdav/auth';
import type {
	MaybePromise,
	RequestParam,
	RequestResponse,
	StringKV,
} from '@hesprs/sync-engine-sdk';

const { request } = testKit;

const credentials = {
	endpoint: 'https://dav.example.com/dav',
	password: 'secret',
	username: 'alice',
};
const realm = 'sync';

const CHALLENGE =
	`Digest realm="${realm}", nonce="abc123", qop="auth,auth-int", ` +
	'opaque="opaque-token", algorithm=MD5';

const memoryDB = openMemoryDB<
	Record<string, unknown>,
	{ authMarker?: string; digest?: DigestInfo }
>('webdav-test');

type Control = (url: string, params: RequestParam) => MaybePromise<Partial<RequestResponse>>;

beforeEach(() => {
	memoryDB.setMeta('authMarker', undefined);
	memoryDB.setMeta('digest', undefined);
});

function createAuthorization(control: Control, overrides: Partial<typeof credentials> = {}) {
	const harness = request(control);
	return {
		calls: harness.calls,
		request: authorizationMiddleware(
			harness.request,
			{ ...credentials, ...overrides },
			memoryDB,
		),
	};
}

function parseDirectives(authorization: string): StringKV {
	const directives: StringKV = {};
	for (const segment of authorization.slice('Digest '.length).split(', ')) {
		const index = segment.indexOf('=');
		directives[segment.slice(0, index)] = segment.slice(index + 1).replaceAll(/^"|"$/gu, '');
	}
	return directives;
}

// RFC 7616: response = MD5(HA1:nonce[:nc:cnonce:qop]:HA2) with HA1/HA2 as below.
async function expectedResponse(
	{ cnonce, nc, nonce, qop }: StringKV,
	{ method, uri }: { method: string; uri: string },
) {
	const ha1 = await md5(`${credentials.username}:${realm}:${credentials.password}`);
	const ha2 = await md5(`${method}:${uri}`);
	if (qop) return md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
	return md5(`${ha1}:${nonce}:${ha2}`);
}

// First call gets the challenge, later calls succeed.
function challengeOnce(challenge: string = CHALLENGE): Control {
	let challenged = false;
	return () => {
		if (challenged) return {};
		challenged = true;
		return { headers: { 'www-authenticate': challenge }, status: 401 };
	};
}

test('sends Basic auth while the server accepts it', async () => {
	const auth = createAuthorization(() => ({}));
	const response = await auth.request('https://dav.example.com/dav/Notes/', {
		method: 'PROPFIND',
	});
	expect(response.status).toBe(200);
	expect(auth.calls).toHaveLength(1);
	expect(auth.calls[0]?.headers?.Authorization).toBe(`Basic ${btoa('alice:secret')}`);
});

test('retries with a Digest header built from the 401 challenge', async () => {
	const auth = createAuthorization(challengeOnce());
	const response = await auth.request('https://dav.example.com/dav/Notes/file.md', {
		method: 'PROPFIND',
	});
	expect(response.status).toBe(200);
	expect(auth.calls).toHaveLength(2);
	expect(auth.calls[0]?.headers?.Authorization).toBe(`Basic ${btoa('alice:secret')}`);
	const directives = parseDirectives(auth.calls[1]?.headers?.Authorization ?? '');
	expect(directives).toMatchObject({
		algorithm: 'MD5',
		nc: '00000001',
		nonce: 'abc123',
		opaque: 'opaque-token',
		qop: 'auth',
		realm,
		uri: '/dav/Notes/file.md',
		username: 'alice',
	});
	expect(directives.response).toBe(
		await expectedResponse(directives, { method: 'PROPFIND', uri: '/dav/Notes/file.md' }),
	);
	expect(memoryDB.getMeta('authMarker')).toBe(`${credentials.endpoint}~alice~secret`);
	expect(memoryDB.getMeta('digest')).toMatchObject({
		ha1: await md5(`alice:${realm}:secret`),
		nc: 1,
	});
});

test('keeps using Digest for later requests and increments the nonce count', async () => {
	const auth = createAuthorization(challengeOnce());
	await auth.request('https://dav.example.com/dav/Notes/file.md', { method: 'GET' });
	const response = await auth.request('https://dav.example.com/dav/Other/file.md', {
		method: 'PUT',
	});
	expect(response.status).toBe(200);
	expect(auth.calls).toHaveLength(3);
	const directives = parseDirectives(auth.calls[2]?.headers?.Authorization ?? '');
	expect(directives.nc).toBe('00000002');
	expect(directives.nonce).toBe('abc123');
	expect(directives.uri).toBe('/dav/Other/file.md');
	expect(directives.response).toBe(
		await expectedResponse(directives, { method: 'PUT', uri: '/dav/Other/file.md' }),
	);
});

test('draws distinct nonce counts for concurrent requests', async () => {
	const auth = createAuthorization(challengeOnce());
	await auth.request('https://dav.example.com/dav/Notes/seed.md', { method: 'GET' });
	const [first, second] = await Promise.all([
		auth.request('https://dav.example.com/dav/Notes/a.md', { method: 'GET' }),
		auth.request('https://dav.example.com/dav/Notes/b.md', { method: 'GET' }),
	]);
	expect(first.status).toBe(200);
	expect(second.status).toBe(200);
	const counts = auth.calls
		.slice(2)
		.map((call) => parseDirectives(call.headers?.Authorization ?? '').nc)
		.sort();
	expect(counts).toEqual(['00000002', '00000003']);
});

test('carries the Digest state across middleware instances through the memory DB', async () => {
	const first = createAuthorization(challengeOnce());
	await first.request('https://dav.example.com/dav/Notes/file.md', { method: 'GET' });
	await first.request('https://dav.example.com/dav/Notes/other.md', { method: 'GET' });

	// A fresh middleware instance (the store replaces the former in-closure state) goes straight to Digest.
	const second = createAuthorization(() => ({}));
	const response = await second.request('https://dav.example.com/dav/Notes/third.md', {
		method: 'GET',
	});
	expect(response.status).toBe(200);
	expect(second.calls).toHaveLength(1);
	const directives = parseDirectives(second.calls[0]?.headers?.Authorization ?? '');
	expect(directives.nonce).toBe('abc123');
	expect(directives.nc).toBe('00000003');
	expect(directives.response).toBe(
		await expectedResponse(directives, { method: 'GET', uri: '/dav/Notes/third.md' }),
	);
});

test('falls back to Basic when the auth marker no longer matches the credentials', async () => {
	const auth = createAuthorization(challengeOnce());
	await auth.request('https://dav.example.com/dav/Notes/file.md', { method: 'GET' });

	const rotated = createAuthorization(() => ({}), { password: 'rotated' });
	const response = await rotated.request('https://dav.example.com/dav/Notes/file.md', {
		method: 'GET',
	});
	expect(response.status).toBe(200);
	expect(rotated.calls).toHaveLength(1);
	expect(rotated.calls[0]?.headers?.Authorization).toBe(`Basic ${btoa('alice:rotated')}`);
	expect(memoryDB.getMeta('authMarker')).toBe(`${credentials.endpoint}~alice~secret`);
});

test('renews the stored challenge when the server re-challenges a Digest request', async () => {
	let attempts = 0;
	const auth = createAuthorization(() => {
		attempts += 1;
		// Attempt 1 rejects Basic with nonce abc123; attempt 3 rejects the stale abc123 with fresh99.
		if (attempts !== 1 && attempts !== 3) return {};
		const nonce = attempts === 1 ? 'abc123' : 'fresh99';
		return {
			headers: {
				'www-authenticate': `Digest realm="${realm}", nonce="${nonce}", qop="auth"`,
			},
			status: 401,
		};
	});
	const url = 'https://dav.example.com/dav/Notes/file.md';
	expect((await auth.request(url, { method: 'PROPFIND' })).status).toBe(200);
	const second = await auth.request(url, { method: 'PROPFIND' });
	expect(second.status).toBe(200);
	expect(auth.calls).toHaveLength(4);
	const stale = parseDirectives(auth.calls[2]?.headers?.Authorization ?? '');
	const renewed = parseDirectives(auth.calls[3]?.headers?.Authorization ?? '');
	expect(stale.nonce).toBe('abc123');
	expect(renewed.nonce).toBe('fresh99');
	expect(renewed.nc).toBe('00000001');
	expect(renewed.response).toBe(
		await expectedResponse(renewed, { method: 'PROPFIND', uri: '/dav/Notes/file.md' }),
	);
});

test('supports challenges without qop using the legacy response formula', async () => {
	const auth = createAuthorization(challengeOnce(`Digest realm="${realm}", nonce="legacy"`));
	const response = await auth.request('https://dav.example.com/dav/Notes/', { method: 'GET' });
	expect(response.status).toBe(200);
	expect(auth.calls).toHaveLength(2);
	const directives = parseDirectives(auth.calls[1]?.headers?.Authorization ?? '');
	expect(directives.nonce).toBe('legacy');
	expect(directives.qop).toBeUndefined();
	expect(directives.nc).toBeUndefined();
	expect(directives.response).toBe(
		await expectedResponse(directives, { method: 'GET', uri: '/dav/Notes/' }),
	);
});

test('parses the Digest challenge when the server offers Basic and Digest together', async () => {
	const auth = createAuthorization(
		challengeOnce(
			`Basic realm="basic-realm", Digest realm="${realm}", nonce="abc123", qop="auth"`,
		),
	);
	const response = await auth.request('https://dav.example.com/dav/Notes/', {
		method: 'PROPFIND',
	});
	expect(response.status).toBe(200);
	expect(auth.calls).toHaveLength(2);
	const directives = parseDirectives(auth.calls[1]?.headers?.Authorization ?? '');
	expect(directives.realm).toBe(realm);
	expect(directives.nonce).toBe('abc123');
	expect(directives.response).toBe(
		await expectedResponse(directives, { method: 'PROPFIND', uri: '/dav/Notes/' }),
	);
});

test('returns the 401 response when the challenge only offers Basic', async () => {
	const auth = createAuthorization(() => ({
		headers: { 'www-authenticate': `Basic realm="${realm}"` },
		status: 401,
	}));
	const response = await auth.request('https://dav.example.com/dav/', { method: 'PROPFIND' });
	expect(response.status).toBe(401);
	expect(auth.calls).toHaveLength(1);
});

test('returns the 401 response when the challenge requires an unsupported algorithm', async () => {
	const auth = createAuthorization(() => ({
		headers: {
			'www-authenticate': `Digest realm="${realm}", nonce="abc123", algorithm=SHA-256, qop="auth"`,
		},
		status: 401,
	}));
	const response = await auth.request('https://dav.example.com/dav/', { method: 'PROPFIND' });
	expect(response.status).toBe(401);
	expect(auth.calls).toHaveLength(1);
});

test('returns 401 responses that carry no challenge header', async () => {
	const auth = createAuthorization(() => ({ status: 401 }));
	const response = await auth.request('https://dav.example.com/dav/', { method: 'PROPFIND' });
	expect(response.status).toBe(401);
	expect(auth.calls).toHaveLength(1);
});
