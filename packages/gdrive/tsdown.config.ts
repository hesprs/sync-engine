import { syncEngineTransform } from '@hesprs/sync-engine-sdk/dev';
import { defineConfig } from 'tsdown';

const dev = process.env.MODE === 'dev';

export default defineConfig({
	clean: !dev,
	dts: false,
	entry: { gdrive: 'src/index.ts' },
	minify: true,
	outExtensions: () => ({ js: '.js' }),
	outputOptions: { codeSplitting: false },
	plugins: [syncEngineTransform()],
});
