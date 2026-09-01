import { syncEngineModule } from '@hesprs/sync-engine-sdk/dev';
import { defineConfig } from 'tsdown';
import modules from '../../modules.json';

const dev = process.env.MODE === 'dev';

export default defineConfig({
	clean: !dev,
	dts: false,
	entry: {
		'i18n-ru': 'src/ru/index.ts',
		'i18n-zh': 'src/zh/index.ts',
		'i18n-zh-TW': 'src/zh-TW/index.ts',
	},
	minify: true,
	outExtensions: () => ({ js: '.js' }),
	plugins: [syncEngineModule(modules)],
});
