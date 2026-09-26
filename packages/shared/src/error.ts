export type ErrorLike = {
	message?: unknown;
	status?: unknown;
	res?: {
		status?: unknown;
	};
	response?: {
		status?: unknown;
	};
	cause?: unknown;
	error?: unknown;
	code?: unknown;
	domain?: unknown;
};

export function getStatus(error: unknown): number | undefined {
	const err = error as ErrorLike;
	const candidates = [err.status, err.res?.status, err.response?.status];
	for (const candidate of candidates) if (typeof candidate === 'number') return candidate;
}

export function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error), { cause: error });
}

export function describeError(error: Error, msg: string) {
	error.message = `${msg}: \`${error.message}\``;
	return error;
}
