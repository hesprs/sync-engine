import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';

const en = {
	API: 'API',
	abstractions: 'Abstractions',
	architecture: 'Architecture',
	asymmetricStorage: 'Asymmetric Storage',
	benchmark: 'Benchmark',
	claims: 'Claims',
	code: 'en-US',
	contributing: 'Contributing',
	copyright: 'Copyright',
	debugAndTesting: 'Debug & Testing',
	deepDive: 'Deep Dive',
	devOps: 'DevOps',
	developAModule: 'Develop a Module',
	development: 'Development',
	distribution: 'Distribution',
	encryption: 'Encryption',
	events: 'Events',
	extensibility: 'Extensibility',
	fileSystem: 'File System',
	fileSystemWrappers: 'File System Wrappers',
	fileTree: 'File Tree',
	folder: '',
	home: 'Home',
	i18n: 'I18n',
	licenseMessage:
		'All content licensed under the <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> License.',
	migrateFromV2: 'Migrate from V2',
	miscellaneous: 'Miscellaneous',
	moduleManagementPage: 'Module Management Page',
	modules: 'Modules',
	nativeName: 'English',
	permissions: 'Permissions',
	registration: 'Registration',
	request: 'Request',
	requestMiddleware: 'RequestMiddleware',
	s3: 'S3',
	security: 'Security',
	settings: 'Settings',
	sideDescription: 'Next-generation syncing plugin for Obsidian.',
	smartMerge: 'Smart Merge',
	storage: 'Storage',
	sync: 'Sync',
	usage: 'Usage',
	usageGuide: 'Usage Guide',
	userInterface: 'User Interface',
	webdav: 'WebDAV',
	welcome: 'Welcome',
	whySyncEngine: 'Why Sync Engine',
};

const translations = { en } as const;

type Translation = typeof en;
type Translations = typeof translations;
type LocaleConfig<C> = LocaleSpecificConfig<C> & { label: string; link?: string };

export function translate<K extends keyof Translation, L extends keyof Translations>(
	key: K,
	lang: L,
) {
	return translations[lang][key];
}

export function configGenerator<C = DefaultTheme.Config>(
	factory: (
		translate: <K extends keyof Translation>(key: K) => Translation[K],
	) => LocaleConfig<NoInfer<C>>,
): (lang: keyof Translations) => LocaleConfig<C> {
	return (lang) => factory((key) => translate(key, lang));
}
