import { getLanguage } from 'obsidian';
import type { General } from '@/types';

// https://github.com/obsidianmd/obsidian-translations
export type ObsidianLanguageCode =
	| 'en'
	| 'af'
	| 'am'
	| 'ar'
	| 'az'
	| 'be'
	| 'bg'
	| 'bn'
	| 'ca'
	| 'cs'
	| 'da'
	| 'de'
	| 'dv'
	| 'el'
	| 'en-GB'
	| 'eo'
	| 'es'
	| 'eu'
	| 'fa'
	| 'fi'
	| 'fr'
	| 'ga'
	| 'gl'
	| 'he'
	| 'hi'
	| 'hr'
	| 'hu'
	| 'id'
	| 'it'
	| 'ja'
	| 'ka'
	| 'kh'
	| 'kn'
	| 'ko'
	| 'ky'
	| 'la'
	| 'lt'
	| 'lv'
	| 'ml'
	| 'ms'
	| 'nan-TW'
	| 'ne'
	| 'nl'
	| 'nn'
	| 'no'
	| 'oc'
	| 'or'
	| 'pl'
	| 'pt'
	| 'pt-BR'
	| 'ro'
	| 'ru'
	| 'sa'
	| 'si'
	| 'sk'
	| 'sl'
	| 'sq'
	| 'sr'
	| 'sv'
	| 'sw'
	| 'ta'
	| 'te'
	| 'th'
	| 'tl'
	| 'tr'
	| 'tt'
	| 'uk'
	| 'ur'
	| 'uz'
	| 'vi'
	| 'zh'
	| 'zh-TW';

const DEFAULT_LANGUAGE: ObsidianLanguageCode = 'en';

type Factory<A = undefined> = (args: A) => DocumentFragment | string;
export type Fragment<A = undefined> = (args: A) => DocumentFragment;
export type Snippet<A = undefined> = (args: A) => string;

type TranslationTypes = string | Factory<General>;
export type TranslationResource = Record<string, TranslationTypes>;

type TranslateParams<R extends TranslationTypes> =
	R extends Factory<infer A> ? ([A] extends [undefined] ? [] : [A]) : [];
export type Translate<O extends TranslationResource> = <K extends keyof O>(
	key: K,
	...arg: TranslateParams<O[K]>
) => O[K] extends string | Snippet<General> ? string : DocumentFragment;

export default class I18n {
	private readonly targetLangs = new Set<ObsidianLanguageCode>([
		getLanguage(),
		getLanguage().split('-')[0],
	] as Array<ObsidianLanguageCode>);
	readonly i18n = {};

	private readonly registerI18n = (code: ObsidianLanguageCode, resource: TranslationResource) => {
		if (code === DEFAULT_LANGUAGE && !this.targetLangs.has(DEFAULT_LANGUAGE))
			for (const [key, value] of Object.entries(resource))
				(this.i18n as TranslationResource)[key] ??= value;
		else if (this.targetLangs.has(code)) Object.assign(this.i18n, resource);
	};

	private readonly translate = ((key: string, arg: unknown) => {
		const value = (this.i18n as TranslationResource)[key];
		if (typeof value === 'string') return value;
		// TODO: 3.1.5 i18n refactor makes all users with any of the legacy i18n modules fail to load. Catch errors to allow the plugin to load. Remove in October 10
		try {
			return value(arg);
		} catch {
			return createFragment();
		}
	}) as Translate<TranslationResource>;

	root = {
		registerI18n: this.registerI18n,
		translate: this.translate,
	};
}
