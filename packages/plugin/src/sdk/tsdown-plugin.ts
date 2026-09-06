type SyncEngineConfig = {
	deps?: {
		neverBundle?:
			| true
			| string
			| RegExp
			| Array<string | RegExp>
			| ((
					id: string,
					parentId: string | undefined,
					isResolved: boolean,
			  ) => boolean | null | undefined);
	};
};

type ModuleMeta = Partial<
	Record<'name' | 'icon' | 'description' | 'source' | 'version' | 'readme', string>
>;
type ModuleMetaWithId = ModuleMeta & { id: string };

const MAGIC_KEYS = ['name', 'icon', 'description', 'source', 'version', 'readme'] as const;

function magicBytes(meta: ModuleMeta): string {
	const lines = MAGIC_KEYS.filter((key) => meta[key]).map((key) => `${key}: ${meta[key]}`);
	return `/*!\n${lines.join('\n')}\n*/\n`;
}

function resolveMeta(
	meta: ModuleMeta | Array<ModuleMetaWithId> | Record<string, ModuleMeta>,
	entryName: string,
): ModuleMeta | undefined {
	if (Array.isArray(meta)) return meta.find(({ id }) => id === entryName);
	if (typeof Object.values(meta)[0] === 'object')
		return (meta as Record<string, ModuleMeta>)[entryName];
	return meta;
}

export default function syncEngineModule(
	meta?: ModuleMeta | Array<ModuleMetaWithId> | Record<string, ModuleMeta>,
) {
	return {
		name: 'sync-engine-module',
		renderChunk(code: string, chunk: { name: string; isEntry: boolean }) {
			const transformed = code
				.replaceAll(/^[ \t]*import\s+['"]obsidian['"]\s*;?[ \t]*$/gmu, '')
				.replaceAll(
					/^\s*import\s+(?<name>[A-Za-z_$][\w$]*)\s+from\s+(?<quote>['"])obsidian\k<quote>\s*;?\s*$/gmu,
					(_, name: string) => `const ${name} = window.syncEngineApiBridge;`,
				)
				.replaceAll(
					/^\s*import\s+\*\s+as\s+(?<name>[A-Za-z_$][\w$]*)\s+from\s+(?<quote>['"])obsidian\k<quote>\s*;?\s*$/gmu,
					(_, name: string) => `const ${name} = window.syncEngineApiBridge;`,
				)
				.replaceAll(
					/^\s*import\s+(?!(?:type\b|\*\s+as\s+))(?<name>.+?)\s+from\s+(?<quote>['"])obsidian\k<quote>\s*;?\s*$/gmu,
					(_, name: string) => `const ${name} = window.syncEngineApiBridge;`,
				);
			const resolved = chunk.isEntry && meta ? resolveMeta(meta, chunk.name) : undefined;
			const result =
				resolved && Object.keys(resolved).length > 0
					? magicBytes(resolved) + transformed
					: transformed;
			return result === code ? undefined : { code: result };
		},
		tsdownConfig(config: SyncEngineConfig) {
			config.deps ??= {};
			const { neverBundle } = config.deps;
			if (neverBundle === true) return;
			if (typeof neverBundle === 'function')
				config.deps.neverBundle = (id, importer, isResolved) =>
					id === 'obsidian' || neverBundle(id, importer, isResolved);
			else if (Array.isArray(neverBundle)) neverBundle.push('obsidian');
			else if (neverBundle) config.deps.neverBundle = [neverBundle, 'obsidian'];
			else config.deps.neverBundle = ['obsidian'];
		},
	};
}
