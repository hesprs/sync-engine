import syncEngineModule from '@hesprs/sync-engine-sdk/tsdown-plugin';
import moduleCatalog from '@repo/shared/module-catalog';
import { defineConfig } from 'tsdown';

export default defineConfig({
	clean: process.env.MODE !== 'dev',
	dts: false,
	entry: { encryption: 'src/index.ts' },
	minify: true,
	outExtensions: () => ({ js: '.js' }),
	outputOptions: { codeSplitting: false },
	platform: 'browser',
	plugins: [syncEngineModule(moduleCatalog)],
	treeshake: { manualPureFunctions: ['Mutex'] }, // Removes the dead Mutexes in hash-wasm
});
