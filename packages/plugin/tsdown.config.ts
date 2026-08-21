import UnoCSS from '@unocss/postcss';
import postcssMergeRules from 'postcss-merge-rules';
import { defineConfig } from 'tsdown';
import solid from 'unplugin-solid/rolldown';
import man from '../../manifest.json' with { type: 'json' };

const dev = process.env.MODE === 'dev';
const buildingPlugin = process.env.BUILD === 'plugin';
const dtsPass = process.env.PASS === 'dts';

const sharedConfig = defineConfig({
	deps: { neverBundle: ['obsidian'], onlyBundle: false },
	minify: true,
	outExtensions: () => ({ dts: '.spec.d.ts', js: '.js' }),
});

const pluginConfig = defineConfig({
	...sharedConfig,
	clean: !dev,
	copy: [{ from: '../../manifest.json', to: '../../dist' }],
	css: {
		fileName: 'styles.css',
		minify: true,
		postcss: { plugins: [UnoCSS(), postcssMergeRules()] },
		transformer: 'postcss',
	},
	define: { 'Bun.env.VERSION': JSON.stringify(man.version) },
	dts: false,
	entry: { main: 'src/index.ts' },
	format: 'cjs',
	inputOptions: {
		resolve: {
			aliasFields: [['browser']],
			conditionNames: ['browser'],
			mainFields: ['browser', 'module', 'main'],
		},
	},
	outDir: '../../dist',
	outputOptions: { codeSplitting: false },
	platform: 'browser',
	// Fixes SolidJS cannot attach eventListeners to elements existing on another window
	plugins: [solid({ solid: { delegateEvents: false } })],
	target: 'es2024',
});

const sdkConfig = defineConfig({
	...sharedConfig,
	clean: dtsPass,
	dts: dtsPass,
	entry: { dev: 'src/sdk/dev.ts', index: 'src/sdk/index.ts' },
	unbundle: !dtsPass,
});

export default buildingPlugin ? pluginConfig : sdkConfig;
