import syncEngineModule from '@hesprs/sync-engine-sdk/tsdown-plugin';
import moduleCatalog from '@repo/shared/module-catalog';
import { defineConfig } from 'tsdown';

export default defineConfig({
	clean: process.env.MODE !== 'dev',
	dts: false,
	entry: {
		'i18n-ru': 'src/ru/index.ts',
		'i18n-zh': 'src/zh/index.ts',
		'i18n-zh-TW': 'src/zh-TW/index.ts',
	},
	minify: true,
	outExtensions: () => ({ js: '.js' }),
	platform: 'browser',
	plugins: [syncEngineModule(moduleCatalog)],
});
