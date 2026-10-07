import type {
	DatabaseSync,
	Fs,
	WrappedFs,
	Stat,
	Binary,
	FileStat,
	ListReporter,
	FolderStat,
} from '@hesprs/sync-engine-sdk';
import type { EncryptionStores } from './path';
import {
	decryptFileContent,
	deriveMasterKey,
	deriveMasterSalt,
	deriveMetaKey,
	deriveNameKey,
	deriveRootFileKey,
	encryptFileContent,
} from './content';
import { decryptMeta, encryptMeta } from './meta';
import { decryptPathSegments, encryptPathSegments } from './path';
import createDecryptedReadableStream from './read-stream';
import { getEncryptedFileSize } from './shared';
import createEncryptedReadableStream from './write-stream';

export type DerivedKeys = {
	nameKey: Binary;
	rootFileKey: Binary;
	metaKey: Binary;
};

export type EncryptionDBSchema = {
	decryptedToEncrypted: string;
	encryptedToDecrypted: string;
};

export type EncryptionDBMeta = {
	encryptionKeys?: DerivedKeys;
	encryptionMarker?: string;
};

export type EncryptionDB = DatabaseSync<EncryptionDBSchema, EncryptionDBMeta>;

export type EncryptionWrapperOptions = {
	memoryDB: EncryptionDB;
	password: string;
};

class EncryptionFs implements WrappedFs {
	private readonly pathStores: EncryptionStores;
	private keysPromise?: Promise<DerivedKeys>;

	constructor(
		readonly original: Fs,
		private readonly options: EncryptionWrapperOptions,
	) {
		const { password, memoryDB } = options;
		const marker = `${original.getUid()}~${password}`;
		this.pathStores = {
			decryptedToEncrypted: memoryDB.getStore('decryptedToEncrypted'),
			encryptedToDecrypted: memoryDB.getStore('encryptedToDecrypted'),
		};
		if (memoryDB.getMeta('encryptionMarker') !== marker) {
			this.pathStores.decryptedToEncrypted.clear();
			this.pathStores.encryptedToDecrypted.clear();
			memoryDB.setMeta('encryptionKeys', undefined);
			memoryDB.setMeta('encryptionMarker', marker);
		}
	}

	getUid(): string {
		return this.original.getUid();
	}

	async read(key: string, stat: FileStat): Promise<Binary> {
		const [encryptedKey, { rootFileKey }] = await Promise.all([
			this.encryptKey(key),
			this.getKeys(),
		]);
		const encryptedContent = await this.original.read(encryptedKey, stat);
		return decryptFileContent(rootFileKey, encryptedContent, encryptedContent.byteLength);
	}

	async readStream(key: string, stat: FileStat): Promise<ReadableStream<Binary>> {
		const [{ rootFileKey }, source] = await Promise.all([
			this.getKeys(),
			this.encryptKey(key).then((encryptedKey) =>
				this.original.readStream(encryptedKey, stat),
			),
		]);
		return createDecryptedReadableStream(source, rootFileKey, stat.size);
	}

	async write(key: string, value: Binary, stat: FileStat): Promise<string> {
		const [encryptedKey, { rootFileKey, metaKey }] = await Promise.all([
			this.encryptKey(key),
			this.getKeys(),
		]);
		const encryptedContent = await encryptFileContent(rootFileKey, value);
		const originalMeta = stat.meta;
		stat.meta = async () => encryptMeta(metaKey, await originalMeta());
		return this.original.write(encryptedKey, encryptedContent, stat);
	}

	async writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat): Promise<string> {
		const [encryptedKey, { rootFileKey, metaKey }] = await Promise.all([
			this.encryptKey(key),
			this.getKeys(),
		]);
		const stream = await createEncryptedReadableStream(rootFileKey, value, stat.size);
		const originalMeta = stat.meta;
		stat.meta = async () => encryptMeta(metaKey, await originalMeta());
		return this.original.writeStream(encryptedKey, stream, {
			...stat,
			size: getEncryptedFileSize(stat.size),
		});
	}

	async delete(key: string) {
		return this.original.delete(await this.encryptKey(key));
	}

	async move(oldKey: string, newKey: string) {
		const [encryptedOldKey, encryptedNewKey] = await Promise.all([
			this.encryptKey(oldKey),
			this.encryptKey(newKey),
		]);
		return this.original.move(encryptedOldKey, encryptedNewKey);
	}

	async mkdir(key: string, stat: FolderStat, recursive?: boolean) {
		const [encryptedKey, { metaKey }] = await Promise.all([
			this.encryptKey(key),
			this.getKeys(),
		]);
		const originalMeta = stat.meta;
		stat.meta = async () => encryptMeta(metaKey, await originalMeta());
		return this.original.mkdir(encryptedKey, stat, recursive);
	}

	async stat(key: string) {
		const stat = await this.original.stat(await this.encryptKey(key));
		stat.key = await this.decryptKey(stat.key);
		if (stat.isDir) return stat;
		const { metaKey } = await this.getKeys();
		const originalMeta = stat.meta;
		stat.meta = async () => decryptMeta(metaKey, await originalMeta());
		return stat;
	}

	async exists(key: string): Promise<boolean> {
		return this.original.exists(await this.encryptKey(key));
	}

	async list(key: string, reporter: ListReporter) {
		const encryptedKey = await this.encryptKey(key);
		const stats = await this.original.list(encryptedKey, async (progress) =>
			reporter(Object.assign(progress, { current: await this.decryptKey(progress.current) })),
		);
		return this.decryptStats(stats);
	}

	private getKeys(): Promise<DerivedKeys> {
		this.keysPromise ??= this.createKeysPromise();
		return this.keysPromise;
	}

	private async createKeysPromise(): Promise<DerivedKeys> {
		const encryptionKeys = this.options.memoryDB.getMeta('encryptionKeys');
		if (encryptionKeys) return encryptionKeys;
		const masterSalt = await deriveMasterSalt(this.original.getUid());
		const masterKey = await deriveMasterKey(this.options.password, masterSalt);
		const [rootFileKey, nameKey, metaKey] = await Promise.all([
			deriveRootFileKey(masterKey),
			deriveNameKey(masterKey),
			deriveMetaKey(masterKey),
		]);
		const derivedKeys = { metaKey, nameKey, rootFileKey };
		this.options.memoryDB.setMeta('encryptionKeys', derivedKeys);
		return derivedKeys;
	}

	private async encryptKey(key: string): Promise<string> {
		const { nameKey } = await this.getKeys();
		return encryptPathSegments(nameKey, key, this.pathStores);
	}

	private async decryptKey(key: string): Promise<string> {
		const { nameKey } = await this.getKeys();
		return decryptPathSegments(nameKey, key, this.pathStores);
	}

	private async decryptStats(stats: Array<Stat>): Promise<Array<Stat>> {
		const { metaKey } = await this.getKeys();
		return Promise.all(
			stats.map(async (stat) => {
				stat.key = await this.decryptKey(stat.key);
				if (stat.isDir) return stat;
				const originalMeta = stat.meta;
				stat.meta = async () => decryptMeta(metaKey, await originalMeta());
				return stat;
			}),
		);
	}
}

export default function encryptionWrapper(
	original: Fs,
	options: EncryptionWrapperOptions,
): WrappedFs {
	return new EncryptionFs(original, options);
}
