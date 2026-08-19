import type { Translations } from '@';
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
type Primitive = string | number | boolean | null | undefined;
export type Fragment<A = undefined> = (frag: DocumentFragment, args: A) => void;
export type TranslationResource = Record<string, string | Fragment<General>>;
export type InterpolationValues = Record<string, Primitive>;

type TranslateParams<R extends Fragment<General> | string> =
	R extends Fragment<infer A> ? ([undefined] extends [A] ? [] : [A]) : [] | [InterpolationValues];
export type Translate<O extends TranslationResource> = <K extends keyof O>(
	key: K,
	...args: TranslateParams<O[K]>
) => O[K] extends string ? string : DocumentFragment;

export default class I18n {
	private readonly targetLangs = new Set<ObsidianLanguageCode>([
		getLanguage(),
		getLanguage().split('-')[0],
	] as Array<ObsidianLanguageCode>);
	readonly i18n = {};

	private readonly registerI18n = (code: ObsidianLanguageCode, resource: TranslationResource) => {
		if (code === DEFAULT_LANGUAGE && !this.targetLangs.has(DEFAULT_LANGUAGE))
			for (const [key, value] of Object.entries(resource))
				(this.i18n as Record<string, string | Fragment>)[key] ??= value;
		else if (this.targetLangs.has(code)) Object.assign(this.i18n, resource);
	};

	private readonly translate = ((key, params) => {
		const i18n = this.i18n as Translations;
		const value = i18n[key];
		if (typeof value === 'string') {
			if (params) return interpolate(value, params as InterpolationValues);
			return value;
		}
		if (typeof value === 'function')
			return createFragment((frag) => value(frag, params as never));
	}) as Translate<Translations>;

	root = {
		registerI18n: this.registerI18n,
		translate: this.translate as Translate<General>,
	};
}

function interpolate(template: string, params?: InterpolationValues): string {
	if (params === undefined) return template;
	return template.replaceAll(/\{\{\s*(?<key>[^{}\s]+)\s*\}\}/gu, (match, key: string) => {
		const value = params[key];
		return value === undefined ? match : String(value);
	});
}
