// oxlint-disable import/no-nodejs-modules
import type { ThemeConfig } from 'vitepress-theme-trito';
import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import canvas from 'vite-plugin-json-canvas';
import { defineConfig } from 'vitepress';
import { configGenerator } from './i18n';

function p(path: string) {
	return resolve(import.meta.dirname, '..', path);
}

const srcDir = p('src/pages');
const preserveMarkdownSymlinks = {
	enforce: 'pre',
	name: 'preserve-markdown-symlinks',
	resolveId(id: string) {
		const [requestPath, suffix = ''] = id.split(/(?<suffix>[?#].*)/v, 2);
		const path = requestPath.startsWith(srcDir)
			? requestPath
			: requestPath.startsWith('/')
				? resolve(srcDir, `.${requestPath}`)
				: requestPath;
		try {
			if (path.endsWith('.md') && lstatSync(path).isSymbolicLink()) return `${path}${suffix}`;
		} catch {
			// Swallow file system errors
		}
	},
};

const localeConfig = configGenerator<ThemeConfig>((t) => {
	const usage = `${t('folder')}/usage`;
	const development = `${t('folder')}/development`;
	const deepDive = `${t('folder')}/deep-dive`;
	return {
		description: t('sideDescription'),
		label: t('nativeName'),
		lang: t('code'),
		themeConfig: {
			footer: {
				copyright: `${t('copyright')} © 2026 Hēsperus`,
				message: t('licenseMessage'),
			},
			nav: [
				{ link: `${t('folder')}/`, text: t('home') },
				{
					activeMatch: `${usage}/.+`,
					link: `${usage}/welcome`,
					text: t('usage'),
				},
				{
					activeMatch: `${development}/.+`,
					link: `${development}/develop-a-module`,
					text: t('development'),
				},
				{
					activeMatch: `${deepDive}/.+`,
					link: `${deepDive}/architecture`,
					text: t('deepDive'),
				},
			],
			sidebar: {
				[`${usage}/`]: {
					items: [
						{ link: `${usage}/welcome`, text: t('welcome') },
						{ link: `${usage}/why-sync-engine`, text: t('whySyncEngine') },
						{ link: `${usage}/migration`, text: t('migrateFromV2') },
						{ link: `${usage}/benchmark`, text: t('benchmark') },
						{
							items: [
								{ link: `${usage}/settings`, text: t('settings') },
								{ link: `${usage}/modules`, text: t('modules') },
							],
							text: t('usage'),
						},
						{
							items: [
								{ link: `${usage}/permissions`, text: t('permissions') },
								{ link: `${usage}/security`, text: t('security') },
							],
							text: t('claims'),
						},
						{ link: `${usage}/contributing`, text: t('contributing') },
					],
					text: t('usageGuide'),
				},
				[`${development}/`]: {
					items: [
						{ link: `${development}/develop-a-module`, text: t('developAModule') },
						{
							items: [
								{ link: `${development}/file-system`, text: t('fileSystem') },
								{ link: `${development}/request`, text: t('request') },
								{ link: `${development}/sync`, text: t('sync') },
								{ link: `${development}/registration`, text: t('registration') },
								{ link: `${development}/events`, text: t('events') },
								{ link: `${development}/storage`, text: t('storage') },
								{ link: `${development}/i18n`, text: t('i18n') },
								{ link: `${development}/miscellaneous`, text: t('miscellaneous') },
							],
							text: t('API'),
						},
						{
							items: [
								{ link: `${development}/distribution`, text: t('distribution') },
								{
									link: `${development}/debug-and-testing`,
									text: t('debugAndTesting'),
								},
							],
							text: t('devOps'),
						},
					],
					text: t('development'),
				},
				[`${deepDive}/`]: {
					items: [
						{ link: `${deepDive}/architecture`, text: t('architecture') },
						{ link: `${deepDive}/sync`, text: t('sync') },
						{ link: `${deepDive}/extensibility`, text: t('extensibility') },
						{
							items: [
								{ link: `${deepDive}/file-system`, text: t('fileSystem') },
								{
									link: `${deepDive}/file-system-wrappers`,
									text: t('fileSystemWrappers'),
								},
								{
									link: `${deepDive}/asymmetric-storage`,
									text: t('asymmetricStorage'),
								},
								{ link: `${deepDive}/request`, text: t('request') },
								{
									link: `${deepDive}/request-middleware`,
									text: t('requestMiddleware'),
								},
							],
							text: t('abstractions'),
						},
						{
							items: [
								{ link: `${deepDive}/file-tree`, text: t('fileTree') },
								{
									link: `${deepDive}/module-management-page`,
									text: t('moduleManagementPage'),
								},
							],
							text: t('userInterface'),
						},
						{
							collapsed: true,
							items: [
								{ link: `${deepDive}/modules/webdav`, text: t('webdav') },
								{ link: `${deepDive}/modules/s3`, text: t('s3') },
								{ link: `${deepDive}/modules/encryption`, text: t('encryption') },
								{ lint: `${deepDive}/modules/smart-marge`, text: t('smartMerge') },
							],
							text: t('modules'),
						},
					],
					text: t('deepDive'),
				},
			},
		},
		title: 'Sync Engine',
	};
});

export default defineConfig<ThemeConfig>({
	cleanUrls: true,
	head: [
		['link', { href: '/favicon.ico', rel: 'icon' }],
		['meta', { content: 'dark light', name: 'color-scheme' }],
	],
	lastUpdated: true,
	locales: {
		root: localeConfig('en'),
	},
	markdown: { image: { lazyLoad: true } },
	outDir: p('dist'),
	rewrites: { 'en/:rest*': ':rest*' },
	sitemap: { hostname: 'https://sync.consensia.cc' },
	srcDir,
	themeConfig: {
		aside: 'left',
		editLink: 'https://github.com/hesprs/sync-engine/edit/main/docs/src/pages/:path',
		logo: { alt: 'Website logo', dark: '/logo-small-dark.svg', light: '/logo-small-light.svg' },
		logoLarge: { alt: 'Website large logo', src: '/logo.svg' },
		search: { provider: 'local' },
		socialLinks: [
			{ icon: 'npm', link: 'https://www.npmjs.com/package/@hesprs/sync-engine-sdk' },
			{ icon: 'github', link: 'https://github.com/hesprs/sync-engine' },
			{ icon: 'obsidian', link: 'https://community.obsidian.md/plugins/sync-engine' },
		],
	},
	vite: {
		plugins: [preserveMarkdownSymlinks, canvas()],
		publicDir: p('public'),
		resolve: { alias: { '@': p('src') } },
		ssr: { noExternal: ['vitepress-theme-trito'] },
	},
});
