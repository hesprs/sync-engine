// oxlint-disable-next-line typescript/no-explicit-any
export type General = any;

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function importCode<T>(code: string): Promise<T> {
	return import(
		URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))
	) as Promise<T>;
}

export const requestNative: typeof fetch = fetch;
