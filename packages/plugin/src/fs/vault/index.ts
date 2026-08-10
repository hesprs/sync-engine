import type { Stat, Binary } from '@/types';
import type { ListReporter, RootFs } from '../interface';
import type { VaultRequest } from './request';

const TEMP_FOLDER = '.trash';
const MAX_WRITE_TRIAL = 5;

async function removeIfExists(fs: VaultFs, key: string, permanent?: boolean): Promise<void> {
	if (await fs.exists(key)) await fs.delete(key, permanent);
}

async function getFileUid(fs: VaultFs, key: string): Promise<string>;
async function getFileUid(
	fs: VaultFs,
	key: string,
	expectedSize: number,
): Promise<string | undefined>;
async function getFileUid(
	fs: VaultFs,
	key: string,
	expectedSize?: number,
): Promise<string | undefined> {
	const stat = await fs.stat(key);
	if (stat.isDir) throw new Error(`File "${key}" not found!`);
	if (expectedSize !== undefined && stat.size !== expectedSize) return undefined;
	return stat.uid;
}

export default class VaultFs implements RootFs {
	constructor(
		private readonly request: VaultRequest,
		private readonly name: string,
	) {}

	getUid(): string {
		return `obsidian-vault~${this.name}`;
	}

	read(key: string): Promise<Binary> {
		return this.request({ key, method: 'GET' });
	}

	readStream(key: string) {
		return this.request({ key, method: 'GET_STREAM' });
	}

	async write(key: string, value: Binary): Promise<string> {
		// https://github.com/hesprs/sync-engine/issues/178
		// https://forum.obsidian.md/t/on-android-vault-create-intermittently-fails-to-write-file-content/102935
		let uid: string | undefined;
		let trial = 0;
		do {
			await this.request({ key, method: 'PUT', value });
			uid = await getFileUid(this, key, value.byteLength);
			trial++;
		} while (!uid && trial < MAX_WRITE_TRIAL);
		if (!uid) throw new Error('File write fails repeatedly, this is a known Android bug.');
		return uid;
	}

	async writeStream(key: string, value: ReadableStream<Binary>): Promise<string> {
		const tempPath = `${TEMP_FOLDER}/${crypto.randomUUID()}.part`;
		const reader = value.getReader();
		if (!(await this.exists(TEMP_FOLDER))) await this.mkdir(TEMP_FOLDER);
		try {
			while (true) {
				const result = await reader.read();
				if (result.done) break;
				await this.request({ key: tempPath, method: 'APPEND', value: result.value });
			}
			await removeIfExists(this, key);
			await this.move(tempPath, key);
			return await getFileUid(this, key);
		} catch (error) {
			await reader.cancel().catch(() => {});
			await removeIfExists(this, tempPath, true);
			throw error;
		} finally {
			reader.releaseLock();
		}
	}

	delete(key: string, permanent = false): Promise<void> {
		return this.request({ headers: { permanent }, key, method: 'DELETE' });
	}

	move(oldKey: string, newKey: string): Promise<void> {
		return this.request({ headers: { destination: newKey }, key: oldKey, method: 'MOVE' });
	}

	mkdir(key: string): Promise<void> {
		return this.request({ key, method: 'MKDIR' });
	}

	exists(key: string) {
		return this.request({ key, method: 'EXISTS' });
	}

	async list(key: string, reporter: ListReporter): Promise<Array<Stat>> {
		const result: Array<Stat> = [];
		let completed = 1;
		let total = 1;
		const visit = async (dir: string) => {
			// Obsidian's cached file tree omits hidden entries
			// https://github.com/hesprs/sync-engine/issues/222
			const { files, folders } = await this.request({
				headers: { cached: false },
				key: dir,
				method: 'LIST',
			});
			completed++;
			total += files.length + folders.length;
			await Promise.all([
				...files.map(async (p) => {
					if ((await reporter({ completed, current: p, total })) === 'exclude') {
						completed++;
						return;
					}
					result.push(await this.stat(p));
					completed++;
				}),
				...folders.map(async (p) => {
					const report = await reporter({ completed, current: p, total });
					if (report !== 'advance') completed++;
					if (report === 'exclude') return;
					result.push({ isDir: true, key: p });
					if (report === 'include') return;
					await visit(p);
				}),
			]);
		};
		await visit(key);
		return result;
	}

	async stat(key: string): Promise<Stat> {
		const { type, mtime, size } = await this.request({ key, method: 'STAT' });
		return type === 'file'
			? { isDir: false, key, mtime, size, uid: `${mtime}~${size}` }
			: { isDir: true, key };
	}
}
