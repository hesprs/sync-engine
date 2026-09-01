import { syncEngineModule } from '@hesprs/sync-engine-sdk/dev';
import { defineConfig } from 'tsdown';
import modules from '../../modules.json';

const dev = process.env.MODE === 'dev';
const clientId = process.env.GDRIVE_CLIENT_ID;
const clientSecret = process.env.GDRIVE_CLIENT_SECRET;

if (!clientId || !clientSecret)
	throw new Error('GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET must be set to compile GDrive.');

export default defineConfig({
	clean: !dev,
	css: { minify: true },
	define: {
		'process.env.CLIENT_ID': JSON.stringify(btoa(clientId)),
		'process.env.CLIENT_SECRET': JSON.stringify(btoa(clientSecret)),
	},
	dts: false,
	entry: { gdrive: 'src/index.ts' },
	minify: true,
	outExtensions: () => ({ js: '.js' }),
	outputOptions: { codeSplitting: false },
	plugins: [syncEngineModule(modules)],
});
