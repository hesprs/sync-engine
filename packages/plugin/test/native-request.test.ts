import { request } from '@/utils/native';
import { afterAll, expect, test } from 'bun:test';
import { Platform } from 'obsidian';

type NativeOptions = {
	binary?: boolean;
	body?: string;
	contentType?: string;
	headers?: Record<string, string>;
	method?: string;
	url: string;
};

const calls: Array<NativeOptions> = [];
let result: { body: string; headers: Record<string, string>; status: number } = {
	body: '',
	headers: {},
	status: 200,
};

// The mobile branch is chosen per call from the live Platform object.
// The Capacitor boundary has to be in place before calling into it.
Platform.isMobileApp = true;
window.Capacitor = {
	registerPlugin: () => ({
		requestUrl: (options: NativeOptions) => {
			calls.push(options);
			return Promise.resolve(result);
		},
	}),
} as never;

afterAll(() => {
	Platform.isMobileApp = false;
	window.Capacitor = undefined as never;
});

test('mobile request sends a binary body as base64 with the binary flag', async () => {
	const payload = new Uint8Array(0x80_00 * 2 + 5); // Crosses the encoder's chunk boundary
	for (let index = 0; index < payload.length; index++) payload[index] = index % 251;

	await request('https://example.com/file', { body: payload, method: 'PUT', throw: false });

	expect(calls.at(-1)?.binary).toBe(true);
	expect(new Uint8Array(Buffer.from(calls.at(-1)?.body ?? '', 'base64'))).toStrictEqual(payload);
});

test('mobile request decodes the response and lowercases headers', async () => {
	result = { body: btoa('hello'), headers: { 'X-Upper-Case': 'v' }, status: 201 };

	const response = await request('https://example.com/file');

	expect(response.bytes()).toStrictEqual(new TextEncoder().encode('hello'));
	expect(response.text()).toBe('hello');
	expect(response.headers['x-upper-case']).toBe('v');
	expect(response.status).toBe(201);
});

test('mobile request throws on error status unless throw is false', async () => {
	result = { body: btoa('missing'), headers: {}, status: 404 };

	let caught: unknown;
	try {
		await request('https://example.com/missing');
	} catch (error) {
		caught = error;
	}
	expect((caught as Error).message).toBe('Request failed, status 404');
	expect((caught as { status?: number }).status).toBe(404);

	const response = await request('https://example.com/missing', { throw: false });
	expect(response.status).toBe(404);
});
