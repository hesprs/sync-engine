import { isTextFile } from '@/chunker';
import { dirname } from '@repo/shared/path';
import { mkdirRecursive } from '@repo/shared/vault';
import { TFile } from 'obsidian';
import type { CommitLocation } from '@/types';
import type { App } from 'obsidian';

export async function readFileBytes(app: App, file: TFile): Promise<Uint8Array> {
	if (typeof app.vault.readBinary === 'function') {
		const buf = await app.vault.readBinary(file);
		return new Uint8Array(buf);
	}
	const content = await app.vault.read(file);
	return new TextEncoder().encode(content);
}

export async function readCurrentText(app: App, filePath: string): Promise<string> {
	if (!isTextFile(filePath)) return '';
	const existing = app.vault.getAbstractFileByPath(filePath);
	if (existing instanceof TFile)
		try {
			return await app.vault.read(existing);
		} catch {
			return '';
		}
	return '';
}

export async function writeVaultFile(
	app: App,
	filePath: string,
	content: string,
	binary?: Uint8Array,
): Promise<void> {
	const target = app.vault.getAbstractFileByPath(filePath);
	const isText = isTextFile(filePath);
	if (!(target instanceof TFile)) await mkdirRecursive(app.vault.adapter, dirname(filePath));
	if (isText || !binary)
		await (target instanceof TFile
			? app.vault.modify(target, content)
			: app.vault.create(filePath, content));
	else if (
		typeof app.vault.modifyBinary === 'function' &&
		typeof app.vault.createBinary === 'function'
	)
		await (target instanceof TFile
			? app.vault.modifyBinary(target, binary.buffer as ArrayBuffer)
			: app.vault.createBinary(filePath, binary.buffer as ArrayBuffer));
	else {
		const decoded = new TextDecoder().decode(binary);
		await (target instanceof TFile
			? app.vault.modify(target, decoded)
			: app.vault.create(filePath, decoded));
	}
}

export function findDeletedKeys(
	app: App,
	locations: Array<[string, CommitLocation]>,
	isIgnored: (key: string) => boolean,
): Array<string> {
	const latest = new Map<string, number>();
	for (const [ref] of locations) {
		const separator = ref.lastIndexOf('@');
		if (separator <= 0 || separator === ref.length - 1) continue;
		const lamport = Number(ref.slice(separator + 1));
		if (!Number.isFinite(lamport)) continue;
		const key = ref.slice(0, separator);
		const previous = latest.get(key);
		if (previous === undefined || lamport > previous) latest.set(key, lamport);
	}

	return [...latest]
		.filter(([key]) => !app.vault.getAbstractFileByPath(key) && !isIgnored(key))
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([key]) => key);
}

export const isRemoteWriteTask = (name: string): boolean =>
	name === 'download' ||
	name === 'resolveConflict' ||
	name === 'moveLocal' ||
	name === 'removeLocal';

export const namespaceOf = (ctx: { getNamespace: () => string | Error }): string | undefined => {
	const ns = ctx.getNamespace();
	return ns instanceof Error ? undefined : ns;
};

/** Translate types function-valued keys as DocumentFragment; our translations return strings. */
export const text = (value: unknown): string => (typeof value === 'string' ? value : String(value));
