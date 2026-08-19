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

export default function syncEngineTransform() {
	return {
		name: 'sync-engine-transform',
		renderChunk(code: string) {
			const transformed = code
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
			return transformed === code ? undefined : { code: transformed };
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
