import { syncEngineTransform } from '@hesprs/sync-engine-sdk/dev';
import { defineConfig } from 'tsdown';

const dev = process.env.MODE === 'dev';

export default defineConfig({
	clean: !dev,
	define: {
		'process.env.CLIENT_ID': JSON.stringify(process.env.CLIENT_ID ?? ''),
		'process.env.CLIENT_SECRET': JSON.stringify(process.env.CLIENT_SECRET ?? ''),
	},
	dts: false,
	entry: { gdrive: 'src/index.ts' },
	minify: true,
	outExtensions: () => ({ js: '.js' }),
	outputOptions: { codeSplitting: false },
	plugins: [syncEngineTransform()],
});
