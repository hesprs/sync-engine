import zhTW from './translations';
import type {
	ObsidianLanguageCode,
	SelectFromContext,
	TranslationResource,
} from '@hesprs/sync-engine-sdk';

// oxlint-disable-next-line typescript/no-extraneous-class
export default class I18nZhTW {
	constructor(
		ctx: SelectFromContext<{
			registerI18n: (lang: ObsidianLanguageCode, translations: TranslationResource) => void;
		}>,
	) {
		ctx.registerI18n('zh-TW', zhTW);
	}
}
