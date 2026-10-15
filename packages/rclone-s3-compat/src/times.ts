export function msToSeconds(ms: string | undefined): string | undefined {
	if (!ms) return;
	const n = Number(ms);
	if (!Number.isFinite(n)) return;
	return String(n / 1000);
}

export function secondsToMs(seconds: string | undefined): string | undefined {
	if (!seconds) return;
	const n = Number(seconds);
	if (!Number.isFinite(n)) return;
	return String(Math.trunc(n * 1000));
}
