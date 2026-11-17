import { defineConfig, presetWind4 } from 'unocss';

export default defineConfig({
	content: { filesystem: ['src/**/*.{html,js,ts,jsx,tsx,vue,svelte,astro}'] },
	// `se-` prefix keeps generated selectors out of other plugins' class
	// namespace; bare utility words in comments/identifiers can no longer
	// match (issue #338).
	presets: [presetWind4({ prefix: 'se-', preflights: { reset: false } })],
});
