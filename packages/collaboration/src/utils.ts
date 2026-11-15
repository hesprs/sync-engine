import deviceType from '@repo/shared/device-type';

export { default } from '@repo/shared/device-type';
export { toError } from '@repo/shared/error';
export { readSecret } from '@repo/shared/secret';

export function text(value: unknown): string {
	return typeof value === 'string' ? value : String(value);
}

export function isMergeableTextFile(path: string): boolean {
	const lower = path.trim().toLowerCase();
	return (
		lower.endsWith('.md') ||
		lower.endsWith('.markdown') ||
		lower.endsWith('.canvas') ||
		lower.endsWith('.txt')
	);
}

/** Full MQTT client ID: the configured (or detected) prefix plus a per-session random suffix. */
export function buildClientId(prefix: string, instanceId: string): string {
	const normalized = prefix.replaceAll(/[^A-Za-z0-9_-]/gu, '').slice(0, 64) || deviceType();
	return `${normalized}-${instanceId}`;
}
