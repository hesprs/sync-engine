// oxlint-disable import/no-nodejs-modules no-console
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import modules from '../modules.json' with { type: 'json' };
import sha256 from '../packages/plugin/src/utils/sha-256';

type ModuleMeta = {
	id: string;
	name: string;
	version: string;
	description: string;
	main: string;
	icon?: string;
	minPluginVersion?: string;
	integrity: string;
	readme?: string;
};

const ROOT = `${import.meta.dir}/..`;
const BRANCH = 'gh-pages';

function git(args: Array<string>, cwd: string, allowFailure = false): number {
	const result = Bun.spawnSync({ cmd: ['git', ...args], cwd });
	if (!allowFailure && result.exitCode !== 0)
		throw new Error(`git ${args.join(' ')} failed with status ${result.exitCode}`);
	return result.exitCode;
}

async function listMatches(pattern: string): Promise<Array<string>> {
	const matches: Array<string> = [];
	const glob = new Bun.Glob(pattern);

	for await (const path of glob.scan({ absolute: true, cwd: ROOT, dot: true }))
		if (!path.includes('/node_modules/')) matches.push(path);

	return matches.sort();
}

async function main(): Promise<void> {
	git(['fetch', 'origin', BRANCH], ROOT);

	const worktree = await mkdtemp(join(tmpdir(), 'sync-engine-gh-pages-'));
	git(['worktree', 'add', '--detach', worktree, `origin/${BRANCH}`], ROOT);

	try {
		const modulesDir = join(worktree, 'modules');
		let pageFiles: Array<string> = [];
		try {
			pageFiles = await readdir(modulesDir);
		} catch {
			// First deployment has no modules directory.
		}

		let production: Array<ModuleMeta> = [];
		try {
			production = JSON.parse(
				await Bun.file(join(worktree, 'modules.json')).text(),
			) as Array<ModuleMeta>;
		} catch {
			// First deployment has no modules manifest.
		}
		const productionById = new Map(production.map((module) => [module.id, module]));
		const mainIds = new Set(modules.map((module) => module.id));
		const staged = new Map<string, string>();
		const deployed: Array<ModuleMeta> = [];

		for (const module of modules) {
			const basename = `${module.id}.js`;
			const current = productionById.get(module.id);
			const existingIntegrity = current?.integrity;
			const unchanged =
				current?.version === module.version &&
				typeof existingIntegrity === 'string' &&
				pageFiles.includes(basename);

			if (unchanged) {
				deployed.push({ ...module, integrity: existingIntegrity });
				continue;
			}

			const [source] = await listMatches(`**/dist/${basename}`);
			if (!source) {
				console.warn(`Missing dist file for ${basename}, skipping`);
				continue;
			}

			const content = await Bun.file(source).text();
			staged.set(basename, content);
			const integrity = await sha256(content);
			deployed.push({ ...module, integrity });
			console.log(`Redeployed ${basename} (integrity: ${integrity})`);
		}

		await mkdir(modulesDir, { recursive: true });
		for (const [basename, content] of staged)
			await Bun.write(join(modulesDir, basename), content);

		for (const file of pageFiles)
			if (file.endsWith('.js') && !mainIds.has(file.slice(0, -3)))
				await rm(join(modulesDir, file));

		const source = JSON.stringify(deployed);
		await Bun.write(join(worktree, 'modules.json'), source);
		await Bun.write(
			join(worktree, 'modules-alternative.json'),
			source.replaceAll(
				'sync.consensia.cc',
				'raw.githubusercontent.com/hesprs/sync-engine/refs/heads/gh-pages',
			),
		);

		git(['add', '-A'], worktree);
		const diffStatus = git(['diff', '--cached', '--quiet'], worktree, true);
		if (diffStatus === 0) {
			console.log('No module deployment changes');
			return;
		}
		if (diffStatus !== 1) throw new Error('Unable to inspect staged module changes');

		git(
			[
				'-c',
				'user.name=github-actions[bot]',
				'-c',
				'user.email=41898282+github-actions[bot]@users.noreply.github.com',
				'commit',
				'-m',
				'Deploy modules',
			],
			worktree,
		);
		git(['push', 'origin', `HEAD:${BRANCH}`], worktree);
		console.log(`Deployed ${deployed.length} module(s)`);
	} finally {
		git(['worktree', 'remove', '--force', worktree], ROOT, true);
		await rm(worktree, { force: true, recursive: true });
	}
}

try {
	await main();
} catch (error) {
	console.error('Error:', error instanceof Error ? error.message : error);
	throw error;
}
