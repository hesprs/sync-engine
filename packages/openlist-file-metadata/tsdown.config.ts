import syncEngineModule from '@hesprs/sync-engine-sdk/tsdown-plugin';
import moduleCatalog from '@repo/shared/module-catalog';
import { defineConfig } from 'tsdown';

export default defineConfig({
	clean: process.env.MODE !== 'dev',
	dts: false,
	entry: { 'openlist-file-metadata': 'src/index.ts' },
	minify: true,
	outExtensions: () => ({ js: '.js' }),
	outputOptions: { codeSplitting: false },
	plugins: [syncEngineModule(moduleCatalog)],
});
