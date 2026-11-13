import syncEngineModule from '@hesprs/sync-engine-sdk/tsdown-plugin';
import moduleCatalog from '@repo/shared/module-catalog';
import { defineConfig } from 'tsdown';

export default defineConfig({
	clean: process.env.MODE !== 'dev',
	dts: false,
	entry: { collaboration: 'src/index.ts' },
	inputOptions: {
		resolve: {
			aliasFields: [['browser']],
			conditionNames: ['browser'],
			mainFields: ['browser', 'module', 'main'],
		},
	},
	minify: true,
	outExtensions: () => ({ js: '.js' }),
	outputOptions: { codeSplitting: false },
	platform: 'browser',
	plugins: [syncEngineModule(moduleCatalog)],
	target: 'es2024',
});
