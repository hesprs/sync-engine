// oxlint-disable import/no-nodejs-modules no-console
import { mkdir } from 'node:fs/promises';
import modules from '../modules.json' with { type: 'json' };
import sha256 from '../packages/plugin/src/utils/sha-256';

export type ModuleMeta = {
	id: string;
	name: string;
	version: string;
	description: string;
	main: string; // Download link
	icon?: string;
	minPluginVersion?: string;
	integrity: string;
};

const ROOT = `${import.meta.dir}/..`;
const PUBLIC_DIR = `${ROOT}/docs/public`;
const PUBLIC_MODULES_DIR = `${PUBLIC_DIR}/modules`;
const PUBLIC_MODULES_PATH = `${PUBLIC_DIR}/modules.json`;
const PUBLIC_ALTERNATIVE_MODULES_PATH = `${PUBLIC_DIR}/modules-alternative.json`;

async function listMatches(pattern: string): Promise<Array<string>> {
	const matches: Array<string> = [];
	const glob = new Bun.Glob(pattern);

	for await (const path of glob.scan({ absolute: true, cwd: ROOT, dot: true }))
		if (!path.includes('/node_modules/')) matches.push(path);

	return matches.sort();
}

async function main(): Promise<void> {
	await mkdir(PUBLIC_MODULES_DIR, { recursive: true });

	const deployed = await Promise.all(
		modules.map(async (module): Promise<ModuleMeta | undefined> => {
			const basename = `${module.id}.js`;
			const [source] = await listMatches(`**/dist/${basename}`);

			if (!source) {
				console.warn(`Missing dist file for ${basename}, skipping`);
				return;
			}

			const content = await Bun.file(source).text();
			const [integrity] = await Promise.all([
				sha256(content),
				Bun.write(`${PUBLIC_MODULES_DIR}/${basename}`, content),
			]);
			console.log(`Deployed ${basename} (integrity: ${integrity})`);
			return Object.assign(module, { integrity });
		}),
	);

	const result = deployed.filter((entry): entry is ModuleMeta => entry !== undefined);
	const source = JSON.stringify(result);
	await Bun.write(PUBLIC_MODULES_PATH, source);
	// https://github.com/hesprs/sync-engine/issues/229
	await Bun.write(
		PUBLIC_ALTERNATIVE_MODULES_PATH,
		source.replaceAll(
			'sync.consensia.cc',
			'github.com/hesprs/sync-engine/raw/refs/heads/gh-pages',
		),
	);
	console.log(`Wrote modules.json with ${result.length} module(s)`);
}

try {
	await main();
} catch (error) {
	console.error('Error:', error instanceof Error ? error.message : error);
	throw error;
}
