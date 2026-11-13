import type { App } from 'obsidian';

/** Reads a secret from Obsidian's secret storage by its id. */
export default function readSecret(app: App, id?: string): string | undefined {
	return (id ? app.secretStorage.getSecret(id) : undefined) ?? undefined;
}

export { readSecret };
