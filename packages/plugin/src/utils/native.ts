import {
	decodeBase64,
	encodeBase64,
	toArrayBuffer,
	toUint8Array,
	uint8ArrayToText,
} from '@repo/shared/binary';
import { Platform, requestUrl } from 'obsidian';
import type { Binary, StringKV } from '@/types';
import type { RequestUrlParam } from 'obsidian';

const { isTablet, isIosApp, isAndroidApp, isWin, isMacOS, isLinux, isPhone } = Platform;
// oxlint-disable-next-line sort-keys
export const OS = {
	'Android Tablet': isTablet && isAndroidApp,
	iPadOS: isTablet && isIosApp,
	Android: isPhone && isAndroidApp,
	iOS: isPhone && isIosApp,
	Linux: isLinux,
	macOS: isMacOS,
	Windows: isWin,
};

export type RequestParam = Omit<RequestUrlParam, 'body' | 'url'> & {
	body?: string | Binary;
	ignoreCancellation?: boolean;
};
export type RequestResponse = {
	text: () => string;
	bytes: () => Binary;
	// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
	json: <T extends object = object>() => T;
	headers: StringKV;
	status: number;
};
export type Request = (url: string, params?: RequestParam) => Promise<RequestResponse>;

/**
 * Obsidian's mobile requestUrl() base64-encodes a binary body one array element per byte, which
 * peaks at ~11x body size in the Webview. Calling the same native plugin it calls, with our own
 * chunked encoder instead, keeps the peak around 4x, or 1.33x on newer WebView.
 */
type AppPlugin = {
	requestUrl: (options: {
		binary?: boolean;
		body?: string;
		contentType?: string;
		headers?: Record<string, string>;
		method?: RequestUrlParam['method'];
		url: string;
	}) => Promise<{ body: string; headers: Record<string, string>; status: number }>;
};

let appPlugin: AppPlugin | undefined;

function lowercaseHeaders(headers: Record<string, string>): StringKV {
	for (const [key, value] of Object.entries(headers)) {
		const lower = key.toLowerCase();
		if (key === lower) continue;
		headers[lower] = value;
		delete headers[key];
	}
	return headers;
}

async function requestViaCapacitor(
	url: string,
	{ body, throw: th, contentType, headers, method }: RequestParam = {},
): Promise<RequestResponse> {
	appPlugin ??= window.Capacitor.registerPlugin<AppPlugin>('App');
	const {
		body: responseBody,
		headers: responseHeaders,
		status,
	} = await appPlugin.requestUrl({
		binary: body !== undefined && typeof body !== 'string',
		body: typeof body === 'string' || body === undefined ? body : encodeBase64(body),
		contentType,
		headers,
		method,
		url,
	});
	const bytes = decodeBase64(responseBody);
	const lowered = lowercaseHeaders(responseHeaders);
	if ((th ?? true) && status >= 400) {
		const error = new Error(`Request failed, status ${status}`);
		(error as { headers?: StringKV }).headers = lowered;
		(error as { status?: number }).status = status;
		throw error;
	}
	return {
		bytes: () => bytes,
		headers: lowered,
		// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
		json: <T extends object = object>() => JSON.parse(uint8ArrayToText(bytes)) as T,
		status,
		text: () => uint8ArrayToText(bytes),
	};
}

export async function request(url: string, params?: RequestParam): Promise<RequestResponse> {
	if (Platform.isMobileApp) return requestViaCapacitor(url, params);
	const body = params?.body;
	if (body instanceof Uint8Array) (params as RequestUrlParam).body = toArrayBuffer(body);
	const response = await requestUrl(
		params ? (Object.assign(params, { url }) as RequestUrlParam) : url,
	);
	const { arrayBuffer, headers, status } = response; // Those three properties are static while the rest two are getters
	return {
		bytes: () => toUint8Array(arrayBuffer),
		headers: lowercaseHeaders(headers),
		// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
		json: <T extends object = object>() => response.json as T,
		status,
		text: () => response.text,
	};
}
