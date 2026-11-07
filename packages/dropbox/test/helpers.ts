import type { MaybePromise, RequestParam, RequestResponse } from '@hesprs/sync-engine-sdk';

export type Control = (url: string, params: RequestParam) => MaybePromise<Partial<RequestResponse>>;

export function json(value: unknown, status = 200): Partial<RequestResponse> {
	return {
		// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
		json: <T extends object = object>() => value as T,
		status,
		text: () => JSON.stringify(value),
	};
}

export function argOf(params: RequestParam): Record<string, unknown> {
	return JSON.parse(params.headers?.['Dropbox-API-Arg'] ?? '{}') as Record<string, unknown>;
}

export function bodyOf(params: RequestParam): Record<string, unknown> {
	const body = params.body;
	if (typeof body === 'string') return JSON.parse(body) as Record<string, unknown>;
	return JSON.parse(
		new TextDecoder().decode(body instanceof Uint8Array ? body : new Uint8Array(0)),
	) as Record<string, unknown>;
}
