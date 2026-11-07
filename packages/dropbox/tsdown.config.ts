import syncEngineModule from '@hesprs/sync-engine-sdk/tsdown-plugin';
import moduleCatalog from '@repo/shared/module-catalog';
import { defineConfig } from 'tsdown';

const appKey = process.env.DROPBOX_APP_KEY;

if (!appKey) throw new Error('DROPBOX_APP_KEY must be set to compile Dropbox.');

export default defineConfig({
	clean: process.env.MODE !== 'dev',
	css: { minify: true },
	define: { 'process.env.DROPBOX_APP_KEY': JSON.stringify(btoa(appKey)) },
	dts: false,
	entry: { dropbox: 'src/index.ts' },
	minify: true,
	outExtensions: () => ({ js: '.js' }),
	outputOptions: { codeSplitting: false },
	plugins: [syncEngineModule(moduleCatalog)],
});
