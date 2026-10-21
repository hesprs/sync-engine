import { defineConfig, presetWind4 } from 'unocss';

export default defineConfig({
	content: { filesystem: ['src/**/*.{html,js,ts,jsx,tsx,vue,svelte,astro}'] },
	presets: [presetWind4({ preflights: { reset: false } })],
});
